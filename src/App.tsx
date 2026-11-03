import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ASSETS, ZONES_AS_OF, ZONE_DEPTH, activeZone, load, nextZone, save,
  type Asset, type Ladder, type Market, type Tier, type ZoneKey,
} from './lib';
import { AssetSection, type Sort, type SortKey } from './components/AssetSection';
import { DetailDrawer } from './components/DetailDrawer';

const REFRESH_MS = 60_000;

export default function App() {
  const [ladder, setLadder] = useState<Ladder>(() => load('cz:ladder', 'in'));
  const [markets, setMarkets] = useState<Record<string, Market>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<'all' | Tier>('all');
  const [zoneFilter, setZoneFilter] = useState<ZoneKey | null>(null);
  const [starredOnly, setStarredOnly] = useState(false);
  const [starred, setStarred] = useState<Set<string>>(() => new Set(load<string[]>('cz:starred', [])));
  const [sort, setSort] = useState<Sort>({ key: 'zone', dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Set<string>>(new Set());
  const [canEdit, setCanEdit] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [mineOnly, setMineOnly] = useState(false);

  type HoldingsResp = { tickers: string[]; canEdit: boolean; persistent: boolean };
  const applyHoldings = (d: HoldingsResp) => { setHoldings(new Set(d.tickers)); setCanEdit(d.canEdit); setPersistent(d.persistent); };
  useEffect(() => {
    fetch('/api/holdings').then((r) => (r.ok ? r.json() : null)).then((d) => d && applyHoldings(d)).catch(() => {});
  }, []);
  const toggleHolding = async (t: string) => {
    const on = !holdings.has(t);
    setHoldings((h) => { const n = new Set(h); on ? n.add(t) : n.delete(t); return n; }); // optimistic
    try {
      const r = await fetch('/api/holdings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticker: t, on }) });
      if (r.ok) applyHoldings(await r.json());
      else throw new Error();
    } catch {
      setHoldings((h) => { const n = new Set(h); on ? n.delete(t) : n.add(t); return n; }); // undo
    }
  };

  useEffect(() => save('cz:ladder', ladder), [ladder]);
  useEffect(() => save('cz:starred', [...starred]), [starred]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/markets');
      if (!r.ok) throw new Error(r.status === 503 ? 'Rate-limited by CoinGecko — showing last prices' : 'Price feed unavailable — showing last prices');
      const d: { updatedAt: number; coins: Market[] } = await r.json();
      setMarkets((prev) => {
        const next = { ...prev };
        for (const c of d.coins) if (c.price != null || !next[c.ticker]) next[c.ticker] = c;
        return next;
      });
      setUpdatedAt(d.updatedAt);
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Network error');
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    const c = setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); clearInterval(c); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  const toggleStar = (t: string) =>
    setStarred((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const zoneOf = useCallback(
    (a: Asset): ZoneKey | null => { const p = markets[a.ticker]?.price; return p != null ? activeZone(a, p, ladder) : null; },
    [markets, ladder]
  );

  const counts = useMemo(() => {
    const c: Record<ZoneKey, number> = { above: 0, below: 0, slow: 0, moderate: 0, aggressive: 0 };
    for (const a of ASSETS) { const z = zoneOf(a); if (z) c[z]++; }
    return c;
  }, [zoneOf]);

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: k === 'asset' ? 1 : -1 }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = ASSETS.filter((a) => {
      if (tier !== 'all' && a.tier !== tier) return false;
      if (starredOnly && !starred.has(a.ticker)) return false;
      if (mineOnly && !holdings.has(a.ticker)) return false;
      if (zoneFilter) {
        const z = zoneOf(a);
        if (zoneFilter === 'above' ? z !== 'above' && z !== 'below' : z !== zoneFilter) return false;
      }
      if (q && !a.ticker.toLowerCase().includes(q) && !(markets[a.ticker]?.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
    const val = (a: Asset): number | string => {
      const m = markets[a.ticker];
      const p = m?.price;
      switch (sort.key) {
        case 'asset': return a.ticker;
        case 'price': return p ?? -Infinity;
        case 'change24h': return m?.change24h ?? -Infinity;
        case 'zone': {
          if (p == null) return -Infinity;
          const nz = nextZone(a, p, ladder);
          // deeper zone first, then closest to the next zone
          return ZONE_DEPTH[activeZone(a, p, ladder)] * 1000 - (nz ? Math.min(999, Math.abs(nz.pct)) : 0);
        }
        case 'next': {
          if (p == null) return Infinity;
          const nz = nextZone(a, p, ladder);
          return nz ? Math.abs(nz.pct) : 0;
        }
      }
    };
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
      return c * (sort.key === 'next' ? -sort.dir : sort.dir) || a.ticker.localeCompare(b.ticker);
    });
  }, [query, tier, starredOnly, starred, mineOnly, holdings, zoneFilter, zoneOf, markets, sort, ladder]);

  const core = filtered.filter((a) => a.tier === 'core');
  const spec = filtered.filter((a) => a.tier === 'speculative');
  const openAsset = open ? ASSETS.find((a) => a.ticker === open) : null;
  const ago = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const outsideLabel = ladder === 'in' ? 'Above zones' : 'Below zones';

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_20%_-10%,rgba(45,212,191,0.07),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(99,102,241,0.08),transparent)]" />

      <header className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 pb-2 pt-6 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04] ring-1 ring-white/10">
            <svg width="22" height="22" viewBox="0 0 32 32"><rect x="5" y="18" width="5" height="9" rx="1.5" fill="#f43f5e" /><rect x="13.5" y="11" width="5" height="16" rx="1.5" fill="#fbbf24" /><rect x="22" y="5" width="5" height="22" rx="1.5" fill="#2dd4bf" /></svg>
          </div>
          <div className="leading-tight">
            <h1 className="text-xl font-extrabold tracking-tight text-white">Crypto Zones</h1>
            <p className="text-xs font-medium text-ink-400">DCA buy &amp; sell ladders · zones as of {ZONES_AS_OF}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <span className={`h-2 w-2 rounded-full ${error ? 'bg-mod' : updatedAt ? 'bg-slow live-dot' : 'bg-ink-600'}`} />
          {error ? <span className="text-mod">{error}</span> : ago != null ? <span>Live · updated {ago}s ago</span> : <span>Loading prices…</span>}
          <button onClick={refresh} className="ml-1 rounded-md border border-white/10 px-2 py-1 font-semibold text-ink-300 hover:text-white">Refresh</button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 pb-16 pt-4 sm:px-6">
        {/* ladder tabs */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
            {(['in', 'out'] as Ladder[]).map((l) => (
              <button
                key={l}
                onClick={() => { setLadder(l); setZoneFilter(null); }}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition ${ladder === l ? 'bg-white text-ink-950' : 'text-ink-300 hover:text-white'}`}
              >
                {l === 'in' ? 'Ladder In · Buy' : 'Ladder Out · Sell'}
              </button>
            ))}
          </div>
          <p className="max-w-xl text-xs text-ink-400">
            {ladder === 'in' ? 'Accumulation zones — scale in slowly, moderately or aggressively as price falls.' : 'Distribution zones — sell targets at higher prices.'}
          </p>
        </div>

        {/* summary strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['aggressive', 'Aggressive', 'text-agg', 'ring-agg/50'],
            ['moderate', 'Moderate', 'text-mod', 'ring-mod/50'],
            ['slow', 'Slow', 'text-slow', 'ring-slow/50'],
            ['above', outsideLabel, 'text-ink-300', 'ring-white/30'],
          ] as [ZoneKey, string, string, string][]).map(([k, label, tone, ring]) => {
            const n = k === 'above' ? counts.above + counts.below : counts[k];
            const on = zoneFilter === k;
            return (
              <button
                key={k}
                onClick={() => setZoneFilter(on ? null : k)}
                className={`panel flex items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.04] ${on ? `ring-1 ${ring}` : ''}`}
              >
                <span>
                  <span className={`block text-[10.5px] font-bold uppercase tracking-[0.14em] ${tone}`}>{label}</span>
                  <span className="text-[11px] text-ink-400">{on ? 'Filtering · tap to clear' : 'coins in zone'}</span>
                </span>
                <span className="text-3xl font-extrabold text-white num">{updatedAt ? n : '–'}</span>
              </button>
            );
          })}
        </div>

        {/* controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" /></svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker or name"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white placeholder:text-ink-400 focus:border-white/25 focus:outline-none"
            />
          </div>
          <Seg value={tier} onChange={setTier} options={[['all', 'All'], ['core', 'Core'], ['speculative', 'Speculative']]} />
          <button
            onClick={() => setStarredOnly(!starredOnly)}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${starredOnly ? 'border-mod/50 bg-mod/10 text-mod' : 'border-white/[0.08] text-ink-300 hover:text-white'}`}
          >
            ★ Watchlist{starred.size ? ` (${starred.size})` : ''}
          </button>
          {canEdit && (
            <button
              onClick={() => setMineOnly(!mineOnly)}
              title="Coins you hold — these send zone-change alerts"
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${mineOnly ? 'border-slow/50 bg-slow/10 text-slow' : 'border-white/[0.08] text-ink-300 hover:text-white'}`}
            >
              🔔 My coins ({holdings.size})
            </button>
          )}
          {(zoneFilter || query || tier !== 'all' || starredOnly || mineOnly) && (
            <button onClick={() => { setZoneFilter(null); setQuery(''); setTier('all'); setStarredOnly(false); setMineOnly(false); }} className="px-2 text-xs font-semibold text-ink-400 hover:text-white">
              Clear filters
            </button>
          )}
        </div>

        {tier !== 'speculative' && (
          <AssetSection title="Core Assets" dot="bg-indigo-400 text-indigo-400" rows={core} markets={markets} ladder={ladder} sort={sort} onSort={onSort} starred={starred} toggleStar={toggleStar} holdings={holdings} canEdit={canEdit} toggleHolding={toggleHolding} onOpen={setOpen} />
        )}
        {tier !== 'core' && (
          <AssetSection title="Speculative Plays" dot="bg-fuchsia-400 text-fuchsia-400" rows={spec} markets={markets} ladder={ladder} sort={sort} onSort={onSort} starred={starred} toggleStar={toggleStar} holdings={holdings} canEdit={canEdit} toggleHolding={toggleHolding} onOpen={setOpen} />
        )}

        <footer className="pt-6 text-center text-[11px] leading-relaxed text-ink-400">
          Prices from CoinGecko, refreshed every 60s. Zones come from my research notes — not financial advice.
          <br />
          Update zones by editing <code className="text-ink-300">zones.json</code> and pushing to GitHub. Tap 🔔 on a coin to turn its zone alerts on or off.
          {canEdit && !persistent && (
            <span className="mt-2 block text-mod">Alert coin changes reset on redeploy — attach a Railway volume at /data to keep them.</span>
          )}
        </footer>
      </main>

      {openAsset && (
        <DetailDrawer
          asset={openAsset}
          market={markets[openAsset.ticker]}
          ladder={ladder}
          onClose={() => setOpen(null)}
          starred={starred.has(openAsset.ticker)}
          toggleStar={() => toggleStar(openAsset.ticker)}
          alertsOn={holdings.has(openAsset.ticker)}
          canEdit={canEdit}
          toggleAlerts={() => toggleHolding(openAsset.ticker)}
        />
      )}
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex rounded-xl border border-white/[0.08] bg-white/[0.02] p-0.5">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${value === v ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-white'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}
