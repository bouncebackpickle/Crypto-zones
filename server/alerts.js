import { getHoldings, isHolding } from './holdings.js';
import { startTelegram, telegramSend, telegramReady, telegramConfigured, telegramStatus } from './telegram.js';
// Zone-change alerts. Checks prices on a timer and notifies when a coin moves
// into a different buy (ladder in) or sell (ladder out) zone.
//
// Channels (set any of these in Railway → Variables; all set ones are used):
//   NTFY_TOPIC            → push to the ntfy phone app (https://ntfy.sh)
//   TELEGRAM_BOT_TOKEN    → Telegram bot (send it /start to connect; see telegram.js)
//   DISCORD_WEBHOOK_URL   → Discord channel message
// Options:
//   ALERT_LADDERS   "in", "out" or "in,out" (default both)
//   Which coins alert = "My holdings" (bell icons on the site, see holdings.js)
//   ALERT_INTERVAL_MS  how often to check (default 60000)

const env = process.env;
const NTFY_SERVER = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
const NTFY_TOPIC = env.NTFY_TOPIC || '';
const DISCORD = env.DISCORD_WEBHOOK_URL || '';
const LADDERS = (env.ALERT_LADDERS || 'in,out').toLowerCase().split(',').map((s) => s.trim());
const INTERVAL = Number(env.ALERT_INTERVAL_MS) || 60_000;
const CONFIRM_CHECKS = 2; // a new zone must hold for 2 checks in a row (stops flip-flopping at a boundary)
const SITE_URL = env.SITE_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '');

const channels = () => [NTFY_TOPIC && 'ntfy', telegramReady() && 'telegram', DISCORD && 'discord'].filter(Boolean);

// ---------- zone logic (same rules as the site) ----------
export function activeZone(a, price, ladder) {
  if (ladder === 'in') {
    const z = a.ladderIn;
    if (price > z.slow[1]) return 'above';
    if (price >= z.slow[0]) return 'slow';
    if (price >= z.aggressiveBelow) return 'moderate';
    return 'aggressive';
  }
  const z = a.ladderOut;
  if (price < z.slow[0]) return 'below';
  if (price <= z.slow[1]) return 'slow';
  if (price <= z.aggressiveAbove) return 'moderate';
  return 'aggressive';
}
const DEPTH = { above: 0, below: 0, slow: 1, moderate: 2, aggressive: 3 };
const NAME = { above: 'Above Zones', below: 'Below Zones', slow: 'Slow', moderate: 'Moderate', aggressive: 'Aggressive' };

function fmt(n) {
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: n >= 10000 ? 0 : 2 });
  if (n >= 1) return '$' + n.toFixed(2);
  return '$' + Number(n.toPrecision(4));
}
function fmtLevel(n) {
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(3);
  return '$' + n.toFixed(4);
}
function zoneRange(a, ladder, zone) {
  const z = ladder === 'in' ? a.ladderIn : a.ladderOut;
  if (zone === 'slow') return `${fmtLevel(z.slow[0])}–${fmtLevel(z.slow[1])}`;
  if (zone === 'moderate') return `${fmtLevel(z.moderate[0])}–${fmtLevel(z.moderate[1])}`;
  if (zone === 'aggressive') return ladder === 'in' ? `below ${fmtLevel(z.aggressiveBelow)}` : `above ${fmtLevel(z.aggressiveAbove)}`;
  return '';
}

function describe(a, ladder, from, to, price) {
  const side = ladder === 'in' ? 'buy' : 'sell';
  const deeper = DEPTH[to] > DEPTH[from];
  const icon = to === 'aggressive' ? '🔴' : to === 'moderate' ? '🟡' : to === 'slow' ? '🟢' : '⚪️';
  let title, line;
  if (to === 'above' || to === 'below') {
    title = `${a.ticker} left the ${side} zones`;
    line = `${a.ticker} is now ${NAME[to].toLowerCase()} (${side} ladder) at ${fmt(price)}. Was in ${NAME[from]}.`;
  } else {
    title = `${a.ticker} → ${NAME[to]} ${side} zone`;
    const action = ladder === 'in'
      ? { slow: 'Buy slowly', moderate: 'Buy at a moderate rate', aggressive: 'Buy aggressively' }[to]
      : { slow: 'Start selling slowly', moderate: 'Sell at a moderate rate', aggressive: 'Sell aggressively' }[to];
    line = `${a.ticker} ${deeper ? 'moved into' : 'moved back to'} the ${NAME[to]} ${side} zone (${zoneRange(a, ladder, to)}) at ${fmt(price)}. Was ${NAME[from]}. ${action}.`;
  }
  return { title: `${icon} ${title}`, body: line, priority: to === 'aggressive' ? 'high' : 'default', tag: ladder === 'in' ? 'chart_with_downwards_trend' : 'moneybag' };
}

// ---------- senders ----------
async function send({ title, body, priority = 'default', tag = 'bell' }) {
  const results = {};
  const jobs = [];
  if (NTFY_TOPIC) {
    jobs.push(
      fetch(`${NTFY_SERVER}/${encodeURIComponent(NTFY_TOPIC)}`, {
        method: 'POST',
        body,
        headers: { Title: encodeHeader(title), Priority: priority, Tags: tag, ...(SITE_URL ? { Click: SITE_URL } : {}) },
      }).then((r) => (results.ntfy = r.ok ? 'sent' : `error ${r.status}`))
    );
  }
  if (telegramReady()) {
    const html = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    jobs.push(
      telegramSend(`<b>${html(title)}</b>\n${html(body)}${SITE_URL ? `\n${SITE_URL}` : ''}`)
        .then((r) => (results.telegram = r))
        .catch((e) => (results.telegram = `error: ${e.message}`))
    );
  }
  if (DISCORD) {
    jobs.push(
      fetch(DISCORD, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: `**${title}**\n${body}${SITE_URL ? `\n<${SITE_URL}>` : ''}` }),
      }).then((r) => (results.discord = r.ok ? 'sent' : `error ${r.status}`))
    );
  }
  await Promise.allSettled(jobs);
  return results;
}
// HTTP headers must be ASCII; ntfy accepts RFC 2047 encoded titles for emoji
function encodeHeader(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
}

// ---------- watcher ----------
const confirmed = new Map(); // "BTC:in" -> zone we last told you about
const pending = new Map(); // "BTC:in" -> { zone, count }
const history = []; // last alerts, newest first
let lastCheck = null;
let lastError = null;

export function alertStatus() {
  return {
    channels: channels(),
    telegram: telegramStatus(),
    ladders: LADDERS,
    holdings: getHoldings(),
    checkEverySeconds: INTERVAL / 1000,
    lastCheck: lastCheck && new Date(lastCheck).toISOString(),
    lastError,
    recentAlerts: history.slice(0, 20),
  };
}

export async function sendTestAlert() {
  if (!channels().length) {
    return {
      ok: false,
      message: telegramConfigured()
        ? 'Telegram bot is set up but not connected yet: open your bot in Telegram and send /start.'
        : 'No alert channel set. Add TELEGRAM_BOT_TOKEN (or NTFY_TOPIC / DISCORD_WEBHOOK_URL) in Railway → Variables.',
    };
  }
  const results = await send({ title: '✅ Crypto Zones test alert', body: 'Alerts are working. You will get a message whenever a coin moves into a different buy or sell zone.', tag: 'white_check_mark' });
  return { ok: true, results };
}

export function startAlerts({ assets, getMarkets }) {
  const tick = async () => {
    try {
      const { coins } = await getMarkets();
      const price = new Map(coins.filter((c) => c.price != null).map((c) => [c.ticker, c.price]));
      for (const a of assets) { // track every coin so newly-added holdings don't fire stale alerts
        const p = price.get(a.ticker);
        if (p == null) continue;
        for (const ladder of LADDERS) {
          if (ladder !== 'in' && ladder !== 'out') continue;
          const key = `${a.ticker}:${ladder}`;
          const zone = activeZone(a, p, ladder);
          const known = confirmed.get(key);
          if (!known) { confirmed.set(key, zone); continue; } // first sighting (e.g. after a restart): remember, don't alert
          if (zone === known) { pending.delete(key); continue; }
          const pend = pending.get(key);
          const count = pend && pend.zone === zone ? pend.count + 1 : 1;
          if (count < CONFIRM_CHECKS) { pending.set(key, { zone, count }); continue; }
          pending.delete(key);
          confirmed.set(key, zone);
          if (!isHolding(a.ticker)) continue; // only alert for coins you hold
          const msg = describe(a, ladder, known, zone, p);
          history.unshift({ at: new Date().toISOString(), ticker: a.ticker, ladder, from: known, to: zone, price: p, message: msg.body });
          history.length = Math.min(history.length, 50);
          console.log(`[alert] ${msg.title} — ${msg.body}`);
          if (channels().length) await send(msg);
        }
      }
      lastCheck = Date.now();
      lastError = null;
    } catch (e) {
      lastError = e.message;
    }
  };
  console.log(`Zone alerts: checking every ${INTERVAL / 1000}s via ${channels().join(', ') || 'no channel yet (logs only)'}`);
  setTimeout(tick, 5_000);
  setInterval(tick, INTERVAL);
  startTelegram({ assets, getMarkets, activeZone, fmt, fmtLevel, siteUrl: SITE_URL });
}
