import zonesData from '../zones.json';

export type Range = [number, number];
export type Tier = 'core' | 'speculative';
export type Ladder = 'in' | 'out';
export type ZoneKey = 'above' | 'below' | 'slow' | 'moderate' | 'aggressive';

export interface Asset {
  ticker: string;
  tier: Tier;
  snapshotPrice: number;
  coingeckoId: string | null;
  ladderIn: { slow: Range; moderate: Range; aggressiveBelow: number };
  ladderOut: { slow: Range; moderate: Range; aggressiveAbove: number };
}

export interface Market {
  ticker: string;
  id: string | null;
  name?: string;
  image?: string | null;
  price: number | null;
  change24h?: number | null;
  change7d?: number | null;
  marketCap?: number | null;
  volume24h?: number | null;
  rank?: number | null;
  sparkline?: number[];
}

export const ZONES_AS_OF: string = zonesData.zonesAsOf;
export const ASSETS = zonesData.assets as unknown as Asset[];

export const ZONE_LABEL: Record<ZoneKey, string> = {
  above: 'Above Zones',
  below: 'Below Zones',
  slow: 'Slow',
  moderate: 'Moderate',
  aggressive: 'Aggressive',
};

/** Which zone the price sits in, for the given ladder. */
export function activeZone(a: Asset, price: number, ladder: Ladder): ZoneKey {
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

/** The next zone deeper into the ladder and the % move needed to reach it. */
export function nextZone(a: Asset, price: number, ladder: Ladder): { label: string; pct: number } | null {
  const zone = activeZone(a, price, ladder);
  let target: number | null = null;
  let label = '';
  if (ladder === 'in') {
    const z = a.ladderIn;
    if (zone === 'above') { target = z.slow[1]; label = 'Slow'; }
    else if (zone === 'slow') { target = z.moderate[1]; label = 'Moderate'; }
    else if (zone === 'moderate') { target = z.aggressiveBelow; label = 'Aggressive'; }
  } else {
    const z = a.ladderOut;
    if (zone === 'below') { target = z.slow[0]; label = 'Slow'; }
    else if (zone === 'slow') { target = z.moderate[0]; label = 'Moderate'; }
    else if (zone === 'moderate') { target = z.aggressiveAbove; label = 'Aggressive'; }
  }
  if (target == null) return null;
  return { label, pct: ((target - price) / price) * 100 };
}

/** Sort key: how "deep" the zone is (higher = more action). */
export const ZONE_DEPTH: Record<ZoneKey, number> = { above: 0, below: 0, slow: 1, moderate: 2, aggressive: 3 };

// ---------- formatting ----------
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: n >= 10000 ? 0 : 2 });
  if (n >= 1) return '$' + n.toFixed(2);
  if (n === 0) return '$0';
  return '$' + Number(n.toPrecision(4)).toString();
}

/** Zone boundaries: keep trailing zeros like the source tables ($0.250). */
export function fmtLevel(n: number): string {
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(3);
  return '$' + n.toFixed(4);
}

export const fmtRange = (r: Range) => `${fmtLevel(r[0])} – ${fmtLevel(r[1])}`;

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(digits) + '%';
}

export function fmtBig(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

export function fmtSupply(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

export function plainSummary(html: string, sentences = 3): string {
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
  return parts.slice(0, sentences).join('').trim();
}

// ---------- localStorage (best effort) ----------
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
