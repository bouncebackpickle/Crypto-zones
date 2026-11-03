// Crypto Zones server: serves the built site and proxies + caches CoinGecko.
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startAlerts, sendTestAlert, alertStatus } from './alerts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8787;
const API_KEY = process.env.COINGECKO_API_KEY || '';
const APP_USERNAME = process.env.APP_USERNAME || '';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
// APP_USERS="dillon:pass1,alex:pass2" — one entry per person (passwords can't contain commas)
const USERS = new Map(
  (process.env.APP_USERS || '')
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.includes(':'))
    .map((e) => [e.slice(0, e.indexOf(':')).trim(), e.slice(e.indexOf(':') + 1)])
);
const AUTH_ON = USERS.size > 0 || !!APP_PASSWORD;
const MOCK = process.env.MOCK === '1';
const MOCK_SWING = Number(process.env.MOCK_SWING) || 0.01; // how far mock prices move (testing alerts)
const CG = 'https://api.coingecko.com/api/v3';

const zones = JSON.parse(readFileSync(path.join(ROOT, 'zones.json'), 'utf8'));
const assets = zones.assets;

// ---------- upstream queue (keeps us under CoinGecko's free rate limit) ----------
const SPACING_MS = API_KEY ? 2100 : 4000;
let lastCall = 0;
let chain = Promise.resolve();
function cg(pathAndQuery) {
  const run = async () => {
    const wait = Math.max(0, lastCall + SPACING_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const res = await fetch(CG + pathAndQuery, {
      headers: { accept: 'application/json', ...(API_KEY ? { 'x-cg-demo-api-key': API_KEY } : {}) },
    });
    if (res.status === 429) {
      lastCall = Date.now() + 30_000; // back off
      throw Object.assign(new Error('CoinGecko rate limit'), { status: 429 });
    }
    if (!res.ok) throw Object.assign(new Error(`CoinGecko ${res.status}`), { status: res.status });
    return res.json();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// ---------- tiny TTL cache ----------
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  if (hit?.pending) return hit.pending;
  const pending = fn()
    .then((v) => { cache.set(key, { t: Date.now(), v }); return v; })
    .catch((e) => { if (hit) { cache.set(key, hit); return hit.v; } cache.delete(key); throw e; });
  cache.set(key, { ...(hit || { t: 0 }), pending });
  return pending;
}

// ---------- ticker -> CoinGecko id resolution ----------
const idMap = new Map(); // ticker -> { id, method }
const logRatio = (a, b) => Math.abs(Math.log(a / b));
const MAX_RATIO = Math.log(3); // price must be within 3x of the snapshot to count as a match

async function resolveIds() {
  const guessed = assets.filter((a) => a.coingeckoId);
  const guessIds = guessed.map((a) => a.coingeckoId).join(',');
  const rows = await cg(`/coins/markets?vs_currency=usd&ids=${guessIds}&per_page=250`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const todo = [];
  for (const a of assets) {
    const r = a.coingeckoId && byId.get(a.coingeckoId);
    if (r && r.current_price && logRatio(r.current_price, a.snapshotPrice) < MAX_RATIO) {
      idMap.set(a.ticker, { id: r.id, method: 'zones.json' });
    } else todo.push(a);
  }
  if (!todo.length) return;
  // One call: every coin whose symbol matches, then pick the closest price (ties -> bigger market cap)
  try {
    const syms = todo.map((a) => a.ticker.toLowerCase()).join(',');
    const cands = await cg(`/coins/markets?vs_currency=usd&symbols=${syms}&include_tokens=all&per_page=250`);
    for (const a of todo) {
      const best = cands
        .filter((c) => c.symbol?.toLowerCase() === a.ticker.toLowerCase() && c.current_price)
        .filter((c) => logRatio(c.current_price, a.snapshotPrice) < MAX_RATIO)
        .sort((x, y) => (y.market_cap || 0) - (x.market_cap || 0))[0];
      if (best) idMap.set(a.ticker, { id: best.id, method: 'auto (symbol + price match)' });
      else idMap.set(a.ticker, { id: null, method: 'unresolved — set coingeckoId in zones.json' });
    }
  } catch (e) {
    for (const a of todo) if (!idMap.has(a.ticker)) idMap.set(a.ticker, { id: a.coingeckoId, method: 'unverified guess' });
  }
}

let resolving = null;
function ensureIds() {
  if (idMap.size === assets.length) return Promise.resolve();
  if (!resolving) resolving = resolveIds().catch((e) => { resolving = null; throw e; });
  return resolving;
}

// ---------- mock data (MOCK=1, for offline development) ----------
function mockMarkets() {
  const t = Date.now() / (Number(process.env.MOCK_PERIOD_MS) || 60000);
  return assets.map((a, i) => {
    const wobble = 1 + MOCK_SWING * Math.sin(t + i);
    const price = a.snapshotPrice * wobble;
    return {
      ticker: a.ticker, id: a.ticker.toLowerCase(), name: a.ticker, image: null,
      price, change24h: 5 * Math.sin(i * 1.7), change7d: 12 * Math.cos(i * 0.9),
      marketCap: price * 1e7 * (60 - i), volume24h: price * 1e6, rank: i + 1,
      sparkline: Array.from({ length: 168 }, (_, k) => price * (1 + 0.06 * Math.sin(k / 12 + i) - 0.0003 * (168 - k))),
    };
  });
}
function mockChart(ticker, days) {
  const a = assets.find((x) => x.ticker.toLowerCase() === ticker) || assets[0];
  const n = days <= 7 ? 168 : days <= 90 ? days * 24 / 4 : days;
  const step = (days * 864e5) / n;
  const now = Date.now();
  return Array.from({ length: n }, (_, k) => {
    const x = k / n;
    return [now - (n - k) * step, a.snapshotPrice * (1.35 - 0.4 * x + 0.12 * Math.sin(x * 18) + 0.04 * Math.sin(x * 90))];
  });
}

// ---------- API ----------
const app = express();
app.disable('x-powered-by');

if (AUTH_ON) {
  app.use((req, res, next) => {
    const [, b64] = (req.headers.authorization || '').split(' ');
    const decoded = b64 ? Buffer.from(b64, 'base64').toString() : '';
    const i = decoded.indexOf(':');
    const user = i >= 0 ? decoded.slice(0, i) : '';
    const pass = i >= 0 ? decoded.slice(i + 1) : '';
    if (USERS.has(user) && USERS.get(user) === pass) return next();
    if (APP_PASSWORD && (!APP_USERNAME || user === APP_USERNAME) && pass === APP_PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="Crypto Zones"').status(401).send('Password required');
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, mock: MOCK }));

// Zone-change alerts: status + a test button
app.get('/api/alerts', (_req, res) => res.json(alertStatus()));
app.get('/api/alerts/test', async (_req, res) => {
  try { res.json(await sendTestAlert()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ids', async (_req, res) => {
  if (MOCK) return res.json({ mock: true });
  try { await ensureIds(); } catch {}
  res.json(Object.fromEntries(assets.map((a) => [a.ticker, idMap.get(a.ticker) || null])));
});

function getMarkets() {
  if (MOCK) return Promise.resolve({ updatedAt: Date.now(), coins: mockMarkets() });
  return cached('markets', 55_000, async () => {
    await ensureIds();
    const ids = [...new Set([...idMap.values()].map((v) => v.id).filter(Boolean))];
    const rows = await cg(
      `/coins/markets?vs_currency=usd&ids=${ids.join(',')}&per_page=250&sparkline=true&price_change_percentage=24h,7d`
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const coins = assets.map((a) => {
      const id = idMap.get(a.ticker)?.id;
      const r = id && byId.get(id);
      if (!r) return { ticker: a.ticker, id: id || null, price: null };
      return {
        ticker: a.ticker, id: r.id, name: r.name, image: r.image, price: r.current_price,
        change24h: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h,
        change7d: r.price_change_percentage_7d_in_currency ?? null,
        marketCap: r.market_cap, volume24h: r.total_volume, rank: r.market_cap_rank,
        sparkline: r.sparkline_in_7d?.price || [],
      };
    });
    return { updatedAt: Date.now(), coins };
  });
}

app.get('/api/markets', async (_req, res) => {
  try {
    res.json(await getMarkets());
  } catch (e) {
    res.status(e.status === 429 ? 503 : 502).json({ error: e.message });
  }
});

app.get('/api/coin/:id', async (req, res) => {
  const id = req.params.id.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (MOCK) {
    const a = assets.find((x) => x.ticker.toLowerCase() === id) || assets[0];
    return res.json({
      id, name: a.ticker, symbol: a.ticker, rank: 1, description: `${a.ticker} is a sample asset shown in mock mode. Real descriptions load from CoinGecko when the site runs online.`,
      marketCap: a.snapshotPrice * 1e8, fdv: a.snapshotPrice * 1.4e8, volume24h: a.snapshotPrice * 5e6,
      circulating: 1e8, max: 2.1e8, ath: a.snapshotPrice * 2.4, athChange: -58.3, athDate: '2025-01-20T00:00:00Z',
      links: { homepage: 'https://example.com', twitter: null, explorer: null }, categories: ['Mock'],
    });
  }
  try {
    const d = await cached('coin:' + id, 24 * 3600_000, () =>
      cg(`/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`)
    );
    const m = d.market_data || {};
    res.json({
      id: d.id, name: d.name, symbol: d.symbol?.toUpperCase(), rank: d.market_cap_rank, image: d.image?.large,
      description: d.description?.en || '', categories: (d.categories || []).filter(Boolean).slice(0, 4),
      marketCap: m.market_cap?.usd, fdv: m.fully_diluted_valuation?.usd, volume24h: m.total_volume?.usd,
      circulating: m.circulating_supply, max: m.max_supply ?? m.total_supply,
      ath: m.ath?.usd, athChange: m.ath_change_percentage?.usd, athDate: m.ath_date?.usd,
      links: {
        homepage: d.links?.homepage?.find(Boolean) || null,
        twitter: d.links?.twitter_screen_name ? `https://x.com/${d.links.twitter_screen_name}` : null,
        explorer: d.links?.blockchain_site?.find(Boolean) || null,
      },
    });
  } catch (e) {
    res.status(e.status === 429 ? 503 : 502).json({ error: e.message });
  }
});

app.get('/api/chart/:id', async (req, res) => {
  const id = req.params.id.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  if (MOCK) return res.json({ prices: mockChart(id, days) });
  try {
    const d = await cached(`chart:${id}:${days}`, days <= 7 ? 10 * 60_000 : 60 * 60_000, () =>
      cg(`/coins/${id}/market_chart?vs_currency=usd&days=${days}`)
    );
    res.json({ prices: d.prices || [] });
  } catch (e) {
    res.status(e.status === 429 ? 503 : 502).json({ error: e.message });
  }
});

// ---------- static site ----------
const dist = path.join(ROOT, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Crypto Zones running on http://localhost:${PORT}${MOCK ? ' (mock data)' : ''}`);
  if (!MOCK) ensureIds().catch((e) => console.warn('ID resolution will retry:', e.message));
  startAlerts({ assets, getMarkets });
});
