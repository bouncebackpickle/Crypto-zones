import { useEffect, useState } from 'react';
import {
  activeZone, fmtBig, fmtLevel, fmtPct, fmtPrice, fmtRange, fmtSupply, load, plainSummary, save,
  type Asset, type Ladder, type Market, type ZoneKey,
} from '../lib';
import { Change, CoinLogo, Star, ZonePill, ZONE_TEXT } from './bits';
import { PriceChart } from './PriceChart';

interface Detail {
  id: string; name: string; symbol: string; rank: number | null; image?: string;
  description: string; categories: string[];
  marketCap?: number; fdv?: number; volume24h?: number; circulating?: number; max?: number | null;
  ath?: number; athChange?: number; athDate?: string;
  links: { homepage: string | null; twitter: string | null; explorer: string | null };
}

const DAY = 24 * 3600_000;

export function DetailDrawer({
  asset, market, ladder, onClose, starred, toggleStar,
}: {
  asset: Asset; market?: Market; ladder: Ladder; onClose: () => void; starred: boolean; toggleStar: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState(false);
  const [view, setView] = useState<Ladder>(ladder);
  const id = market?.id ?? asset.coingeckoId;
  const price = market?.price ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  useEffect(() => {
    setDetail(null); setErr(false);
    if (!id) { setErr(true); return; }
    const key = `cz:coin:${id}`;
    const hit = load<{ t: number; d: Detail } | null>(key, null);
    if (hit && Date.now() - hit.t < DAY) { setDetail(hit.d); return; }
    fetch(`/api/coin/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Detail) => { setDetail(d); save(key, { t: Date.now(), d }); })
      .catch(() => setErr(true));
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="drawer relative flex h-full w-full max-w-[640px] flex-col overflow-y-auto border-l border-white/10 bg-ink-900/95 shadow-2xl">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-ink-900/90 px-5 py-4 backdrop-blur">
          <CoinLogo src={detail?.image || market?.image} ticker={asset.ticker} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-extrabold tracking-tight text-white">{detail?.name || market?.name || asset.ticker}</h2>
              <span className="text-sm font-semibold text-ink-400">{asset.ticker}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-ink-400">
              <span className="rounded bg-white/5 px-1.5 py-0.5 font-semibold uppercase tracking-wider">{asset.tier === 'core' ? 'Core' : 'Speculative'}</span>
              {(detail?.rank ?? market?.rank) && <span>Rank #{detail?.rank ?? market?.rank}</span>}
            </div>
          </div>
          <Star on={starred} onClick={toggleStar} />
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/5 hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {/* price */}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="text-4xl font-extrabold tracking-tight text-white num">{fmtPrice(price)}</div>
            <div className="flex gap-3 pb-1 text-sm font-semibold num">
              <span className="text-ink-400">24h <Change value={market?.change24h} /></span>
              <span className="text-ink-400">7d <Change value={market?.change7d} /></span>
            </div>
            <div className="flex gap-2 pb-1">
              {price != null && <span className="flex items-center gap-1.5 text-[11px] text-ink-400">Buy <ZonePill zone={activeZone(asset, price, 'in')} size="sm" /></span>}
              {price != null && <span className="flex items-center gap-1.5 text-[11px] text-ink-400">Sell <ZonePill zone={activeZone(asset, price, 'out')} size="sm" /></span>}
            </div>
          </div>

          {/* chart */}
          <div>
            <div className="mb-3 flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 text-xs font-semibold w-max">
              {(['in', 'out'] as Ladder[]).map((l) => (
                <button key={l} onClick={() => setView(l)} className={`rounded-md px-3 py-1 transition ${view === l ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-white'}`}>
                  {l === 'in' ? 'Buy zones' : 'Sell zones'}
                </button>
              ))}
            </div>
            <PriceChart id={id} asset={asset} ladder={view} />
          </div>

          {/* ladders */}
          <div className="grid gap-3 sm:grid-cols-2">
            <LadderCard title="Ladder in · buy" asset={asset} price={price} ladder="in" />
            <LadderCard title="Ladder out · sell" asset={asset} price={price} ladder="out" />
          </div>

          {/* about */}
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">What it is</h3>
            {detail ? (
              <>
                <p className="text-sm leading-relaxed text-ink-300">{plainSummary(detail.description) || 'No description available.'}</p>
                {detail.categories?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {detail.categories.map((c) => <span key={c} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-ink-300">{c}</span>)}
                  </div>
                )}
              </>
            ) : err ? (
              <p className="text-sm text-ink-400">Couldn't load coin details right now. Try again in a minute.</p>
            ) : (
              <div className="space-y-2"><div className="h-3 w-full animate-pulse rounded bg-white/5" /><div className="h-3 w-5/6 animate-pulse rounded bg-white/5" /><div className="h-3 w-2/3 animate-pulse rounded bg-white/5" /></div>
            )}
          </div>

          {/* stats */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-3">
            <Stat label="Market cap" value={fmtBig(detail?.marketCap ?? market?.marketCap)} />
            <Stat label="FDV" value={fmtBig(detail?.fdv)} />
            <Stat label="24h volume" value={fmtBig(detail?.volume24h ?? market?.volume24h)} />
            <Stat label="Circulating" value={fmtSupply(detail?.circulating)} />
            <Stat label="Max / total supply" value={fmtSupply(detail?.max)} />
            <Stat label="All-time high" value={fmtPrice(detail?.ath)} sub={detail?.athChange != null ? `${fmtPct(detail.athChange)} from ATH` : undefined} />
          </div>

          {/* links */}
          {detail && (
            <div className="flex flex-wrap gap-2">
              {detail.links.homepage && <LinkBtn href={detail.links.homepage}>Website</LinkBtn>}
              {detail.links.twitter && <LinkBtn href={detail.links.twitter}>X / Twitter</LinkBtn>}
              {detail.links.explorer && <LinkBtn href={detail.links.explorer}>Explorer</LinkBtn>}
              {id && <LinkBtn href={`https://www.coingecko.com/en/coins/${id}`}>CoinGecko</LinkBtn>}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function LadderCard({ title, asset, price, ladder }: { title: string; asset: Asset; price: number | null; ladder: Ladder }) {
  const zone = price != null ? activeZone(asset, price, ladder) : null;
  const rows: { key: ZoneKey; range: string; edge: number }[] =
    ladder === 'in'
      ? [
          { key: 'slow', range: fmtRange(asset.ladderIn.slow), edge: asset.ladderIn.slow[1] },
          { key: 'moderate', range: fmtRange(asset.ladderIn.moderate), edge: asset.ladderIn.moderate[1] },
          { key: 'aggressive', range: `Below ${fmtLevel(asset.ladderIn.aggressiveBelow)}`, edge: asset.ladderIn.aggressiveBelow },
        ]
      : [
          { key: 'slow', range: fmtRange(asset.ladderOut.slow), edge: asset.ladderOut.slow[0] },
          { key: 'moderate', range: fmtRange(asset.ladderOut.moderate), edge: asset.ladderOut.moderate[0] },
          { key: 'aggressive', range: `Above ${fmtLevel(asset.ladderOut.aggressiveAbove)}`, edge: asset.ladderOut.aggressiveAbove },
        ];
  const outside = zone === 'above' || zone === 'below';
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">{title}</h3>
        {zone && <ZonePill zone={zone} size="sm" />}
      </div>
      <div className="space-y-1">
        {outside && <PriceMarker />}
        {rows.map((r) => {
          const active = zone === r.key;
          const dist = price != null && !active ? ((r.edge - price) / price) * 100 : null;
          return (
            <div key={r.key}>
              <div className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm num ${active ? 'bg-white/[0.06] ring-1 ring-white/10' : ''}`}>
                <span className={`w-20 shrink-0 text-[11px] font-bold uppercase tracking-wider ${ZONE_TEXT[r.key]}`}>{r.key}</span>
                <span className="text-right leading-tight">
                  <span className={`block font-semibold ${active ? 'text-white' : 'text-ink-300'}`}>{r.range}</span>
                  <span className="block text-[11px] text-ink-400">{dist != null ? `${fmtPct(dist)} away` : 'Price is here'}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriceMarker() {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/40 to-white/40" />
      Price now
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-white/40 to-white/40" />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-ink-900 px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</div>
      <div className="mt-0.5 font-bold text-white num">{value}</div>
      {sub && <div className="text-[11px] text-ink-400 num">{sub}</div>}
    </div>
  );
}

function LinkBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-ink-300 transition hover:border-white/25 hover:text-white">
      {children} ↗
    </a>
  );
}
