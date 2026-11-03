import { useState } from 'react';
import { activeZone, fmtLevel, fmtPrice, fmtRange, nextZone, type Asset, type Ladder, type Market } from '../lib';
import { Bell, Change, CoinLogo, Sparkline, Star, ZonePill } from './bits';

export type SortKey = 'asset' | 'price' | 'change24h' | 'zone' | 'next';
export interface Sort { key: SortKey; dir: 1 | -1 }

interface Props {
  title: string;
  dot: string;
  rows: Asset[];
  markets: Record<string, Market>;
  ladder: Ladder;
  sort: Sort;
  onSort: (k: SortKey) => void;
  starred: Set<string>;
  toggleStar: (t: string) => void;
  holdings: Set<string>;
  canEdit: boolean;
  toggleHolding: (t: string) => void;
  onOpen: (t: string) => void;
}

export function AssetSection({ title, dot, rows, markets, ladder, sort, onSort, starred, toggleStar, holdings, canEdit, toggleHolding, onOpen }: Props) {
  const [open, setOpen] = useState(true);
  const z = (a: Asset) => (ladder === 'in' ? a.ladderIn : a.ladderOut);
  const aggLabel = (a: Asset) =>
    ladder === 'in' ? `Below ${fmtLevel(a.ladderIn.aggressiveBelow)}` : `Above ${fmtLevel(a.ladderOut.aggressiveAbove)}`;

  const Th = ({ k, children, className = '' }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400 ${className}`}>
      {k ? (
        <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 uppercase tracking-[0.12em] hover:text-white">
          {children}
          <span className={`text-[9px] ${sort.key === k ? 'text-white' : 'opacity-0'}`}>{sort.dir === 1 ? '▲' : '▼'}</span>
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <section className="panel overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-4 sm:px-5">
        <span className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-white">
          <span className={`h-1.5 w-1.5 rounded-full ${dot} shadow-[0_0_10px_currentColor]`} />
          {title}
          <span className="font-medium text-ink-400">· ladder {ladder === 'in' ? 'in' : 'out'} DCA zones</span>
          <span className="ml-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold text-ink-300">{rows.length}</span>
        </span>
        <svg className={`h-4 w-4 text-ink-400 transition ${open ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && rows.length === 0 && <p className="px-5 pb-5 text-sm text-ink-400">No coins match these filters.</p>}

      {open && rows.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-t border-white/5 text-left">
              <thead>
                <tr>
                  <Th k="asset" className="pl-5">Asset</Th>
                  <Th k="price">Latest price</Th>
                  <Th k="change24h">24h</Th>
                  <Th>7d</Th>
                  <Th k="zone">Active zone</Th>
                  <Th>Slow</Th>
                  <Th>Moderate</Th>
                  <Th>Aggressive</Th>
                  <Th k="next" className="pr-5">Next zone</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const m = markets[a.ticker];
                  const price = m?.price ?? null;
                  const zone = price != null ? activeZone(a, price, ladder) : null;
                  const nz = price != null ? nextZone(a, price, ladder) : null;
                  return (
                    <tr
                      key={a.ticker}
                      onClick={() => onOpen(a.ticker)}
                      className="row cursor-pointer border-t border-white/[0.04] transition hover:bg-white/[0.035]"
                    >
                      <td className="py-3 pl-3 pr-3">
                        <div className="flex items-center gap-2">
                          <Star on={starred.has(a.ticker)} onClick={(e) => { e.stopPropagation(); toggleStar(a.ticker); }} />
                          {canEdit && <Bell on={holdings.has(a.ticker)} onClick={(e) => { e.stopPropagation(); toggleHolding(a.ticker); }} />}
                          <CoinLogo src={m?.image} ticker={a.ticker} />
                          <div className="leading-tight">
                            <div className="font-extrabold tracking-tight text-white">{a.ticker}</div>
                            <div className="max-w-[9rem] truncate text-[11px] text-ink-400">{m?.name && m.name !== a.ticker ? m.name : ' '}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 font-bold text-white num">{price == null ? <Loading /> : fmtPrice(price)}</td>
                      <td className="px-3 text-sm font-semibold num"><Change value={m?.change24h} /></td>
                      <td className="px-3"><Sparkline data={m?.sparkline} width={84} height={26} /></td>
                      <td className="px-3">{zone ? <ZonePill zone={zone} /> : <span className="text-ink-600">—</span>}</td>
                      <td className={`px-3 text-sm font-semibold num ${zone === 'slow' ? 'text-slow' : 'text-ink-300'}`}>{fmtRange(z(a).slow)}</td>
                      <td className={`px-3 text-sm font-semibold num ${zone === 'moderate' ? 'text-mod' : 'text-ink-300'}`}>{fmtRange(z(a).moderate)}</td>
                      <td className={`px-3 text-sm font-semibold num ${zone === 'aggressive' ? 'text-agg' : 'text-ink-300'}`}>{aggLabel(a)}</td>
                      <td className="py-3 pl-3 pr-5 text-sm num">
                        {nz ? (
                          <span className="text-ink-300">
                            <span className="font-semibold text-white">{nz.pct > 0 ? '+' : ''}{nz.pct.toFixed(1)}%</span> to {nz.label}
                          </span>
                        ) : zone ? (
                          <span className="font-semibold text-agg">Deepest zone</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards */}
          <div className="grid gap-2 border-t border-white/5 p-3 sm:grid-cols-2 lg:hidden">
            {rows.map((a) => {
              const m = markets[a.ticker];
              const price = m?.price ?? null;
              const zone = price != null ? activeZone(a, price, ladder) : null;
              const nz = price != null ? nextZone(a, price, ladder) : null;
              return (
                <div
                  key={a.ticker}
                  onClick={() => onOpen(a.ticker)}
                  className="cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition active:bg-white/[0.05]"
                >
                  <div className="flex items-center gap-2">
                    <CoinLogo src={m?.image} ticker={a.ticker} size={30} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="font-extrabold text-white">{a.ticker}</div>
                      <div className="truncate text-[11px] text-ink-400">{m?.name && m.name !== a.ticker ? m.name : ' '}</div>
                    </div>
                    <div className="text-right leading-tight">
                      <div className="font-bold text-white num">{price == null ? <Loading /> : fmtPrice(price)}</div>
                      <div className="text-xs font-semibold num"><Change value={m?.change24h} /></div>
                    </div>
                    <div className="flex flex-col">
                      <Star on={starred.has(a.ticker)} onClick={(e) => { e.stopPropagation(); toggleStar(a.ticker); }} />
                      {canEdit && <Bell on={holdings.has(a.ticker)} onClick={(e) => { e.stopPropagation(); toggleHolding(a.ticker); }} />}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {zone ? <ZonePill zone={zone} size="sm" /> : <span />}
                    <span className="text-[11px] text-ink-400 num">
                      {nz ? <><span className="font-semibold text-white">{nz.pct > 0 ? '+' : ''}{nz.pct.toFixed(1)}%</span> to {nz.label}</> : zone ? <span className="text-agg">Deepest zone</span> : ''}
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-[10.5px] num">
                    <Cell label="Slow" value={fmtRange(z(a).slow)} active={zone === 'slow'} tone="text-slow" />
                    <Cell label="Moderate" value={fmtRange(z(a).moderate)} active={zone === 'moderate'} tone="text-mod" />
                    <Cell label="Aggressive" value={aggLabel(a)} active={zone === 'aggressive'} tone="text-agg" />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Cell({ label, value, active, tone }: { label: string; value: string; active: boolean; tone: string }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${active ? 'bg-white/[0.06] ring-1 ring-white/10' : 'bg-white/[0.02]'}`}>
      <div className={`font-bold uppercase tracking-wider ${tone} text-[9px]`}>{label}</div>
      <div className={`mt-0.5 font-semibold leading-snug ${active ? 'text-white' : 'text-ink-300'}`}>{value}</div>
    </div>
  );
}

function Loading() {
  return <span className="inline-block h-3 w-14 animate-pulse rounded bg-white/10 align-middle" />;
}
