// "My holdings" — the coins that send zone-change alerts.
// Saved to a JSON file. On Railway, attach a Volume (mount path /data) so changes
// survive redeploys; without one, the list resets to `alertHoldings` in zones.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const env = process.env;
const DATA_DIR = env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || path.resolve('data');
const FILE = path.join(DATA_DIR, 'holdings.json');
// Persistent unless we're on Railway with no volume attached
export const PERSISTENT = !!(env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH) || !env.RAILWAY_ENVIRONMENT;

let holdings = new Set();

export function initHoldings(zones) {
  const valid = new Set(zones.assets.map((a) => a.ticker));
  let list = null;
  try {
    if (existsSync(FILE)) list = JSON.parse(readFileSync(FILE, 'utf8')).tickers;
  } catch (e) {
    console.warn('Could not read holdings file:', e.message);
  }
  if (!Array.isArray(list)) {
    list = env.ALERT_TICKERS ? env.ALERT_TICKERS.split(',') : zones.alertHoldings || [];
  }
  holdings = new Set(list.map((t) => String(t).trim().toUpperCase()).filter((t) => valid.has(t)));
  console.log(`Alert holdings (${holdings.size}): ${[...holdings].join(', ') || 'none'}${PERSISTENT ? '' : ' — not persistent: attach a Railway volume at /data'}`);
}

export const getHoldings = () => [...holdings].sort();
export const isHolding = (t) => holdings.has(t);

export function setHolding(ticker, on, validTickers) {
  const t = String(ticker).trim().toUpperCase();
  if (!validTickers.has(t)) return false;
  on ? holdings.add(t) : holdings.delete(t);
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify({ tickers: getHoldings(), updatedAt: new Date().toISOString() }, null, 2));
  } catch (e) {
    console.warn('Could not save holdings:', e.message);
  }
  return true;
}
