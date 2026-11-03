import { useState } from 'react';
import { ZONE_LABEL, type ZoneKey } from '../lib';

const PILL: Record<ZoneKey, string> = {
  slow: 'text-slow border-slow/60 bg-slow/10 shadow-[0_0_12px_-2px_rgba(45,212,191,0.45)]',
  moderate: 'text-mod border-mod/60 bg-mod/10 shadow-[0_0_12px_-2px_rgba(251,191,36,0.45)]',
  aggressive: 'text-agg border-agg/60 bg-agg/10 shadow-[0_0_12px_-2px_rgba(244,63,94,0.5)]',
  above: 'text-ink-300 border-ink-600 bg-white/[0.03]',
  below: 'text-ink-300 border-ink-600 bg-white/[0.03]',
};

export function ZonePill({ zone, size = 'md' }: { zone: ZoneKey; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-semibold ${PILL[zone]} ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      {ZONE_LABEL[zone]}
    </span>
  );
}

export const ZONE_TEXT: Record<ZoneKey, string> = {
  slow: 'text-slow', moderate: 'text-mod', aggressive: 'text-agg', above: 'text-ink-300', below: 'text-ink-300',
};

export function CoinLogo({ src, ticker, size = 28 }: { src?: string | null; ticker: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full bg-ink-800 ring-1 ring-white/10"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-ink-700 text-[10px] font-bold text-ink-300 ring-1 ring-white/10"
      style={{ width: size, height: size }}
    >
      {ticker.slice(0, 3)}
    </span>
  );
}

export function Sparkline({ data, width = 96, height = 28 }: { data?: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return <span className="inline-block" style={{ width, height }} />;
  const step = Math.max(1, Math.floor(data.length / 48));
  const pts = data.filter((_, i) => i % step === 0 || i === data.length - 1);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join('');
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={d} fill="none" stroke={up ? '#2dd4bf' : '#f43f5e'} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

export function Change({ value }: { value?: number | null }) {
  if (value == null || !isFinite(value)) return <span className="text-ink-400">—</span>;
  return (
    <span className={value >= 0 ? 'text-slow' : 'text-agg'}>
      {value >= 0 ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}

export function Star({ on, onClick }: { on: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={on ? 'Remove from watchlist' : 'Add to watchlist'}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition hover:bg-white/5 ${on ? 'text-mod' : 'text-ink-600 hover:text-ink-300'}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
        <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
