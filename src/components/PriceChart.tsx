import { useEffect, useRef, useState } from 'react';
import {
  createChart, ColorType, LineStyle, PriceScaleMode,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import { fmtPrice, load, save, type Asset, type Ladder } from '../lib';

interface Band { from: number; to: number; color: string; label: string }

type RangeKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL' | 'CUSTOM';
const PRESETS: RangeKey[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'];
const DAY = 86400;

function presetFrom(k: RangeKey, now: number): number {
  switch (k) {
    case '1D': return now - DAY;
    case '1W': return now - 7 * DAY;
    case '1M': return now - 30 * DAY;
    case '3M': return now - 90 * DAY;
    case '6M': return now - 182 * DAY;
    case 'YTD': return Math.floor(Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000);
    case '1Y': return now - 365 * DAY;
    case '3Y': return now - 3 * 365 * DAY;
    case '5Y': return now - 5 * 365 * DAY;
    default: return now - 90 * DAY;
  }
}
const toInput = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
const fromInput = (s: string) => Math.floor(new Date(s + 'T00:00:00Z').getTime() / 1000);
const fmtDate = (sec: number) => new Date(sec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function PriceChart({ id, asset, ladder }: { id: string | null; asset: Asset; ladder: Ladder }) {
  const [range, setRange] = useState<RangeKey>(() => load<RangeKey>('cz:chartRange', '3M'));
  const today = Math.floor(Date.now() / 1000);
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({ from: toInput(today - 180 * DAY), to: toInput(today) }));
  const [applied, setApplied] = useState(custom);
  const [fit, setFit] = useState(true);
  const [log, setLog] = useState(() => load('cz:chartLog', false));
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [info, setInfo] = useState<{ change: number; first: number; last: number; limited: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => { if (range !== 'CUSTOM') save('cz:chartRange', range); }, [range]);
  useEffect(() => save('cz:chartLog', log), [log]);

  const zi = asset.ladderIn;
  const zo = asset.ladderOut;
  const bands: Band[] =
    ladder === 'in'
      ? [
          { from: zi.slow[0], to: zi.slow[1], color: '45,212,191', label: 'Slow' },
          { from: zi.moderate[0], to: zi.moderate[1], color: '251,191,36', label: 'Moderate' },
          { from: 0, to: zi.aggressiveBelow, color: '244,63,94', label: 'Aggressive' },
        ]
      : [
          { from: zo.slow[0], to: zo.slow[1], color: '45,212,191', label: 'Slow' },
          { from: zo.moderate[0], to: zo.moderate[1], color: '251,191,36', label: 'Moderate' },
          { from: zo.aggressiveAbove, to: Infinity, color: '244,63,94', label: 'Aggressive' },
        ];
  const fitLo = ladder === 'in' ? zi.aggressiveBelow * 0.9 : zo.slow[0];
  const fitHi = ladder === 'in' ? zi.slow[1] : zo.aggressiveAbove * 1.08;

  // Zone bands are an overlay positioned with the series' price->pixel mapping
  const drawBands = () => {
    const chart = chartRef.current, series = seriesRef.current, el = overlay.current, wrap = box.current;
    if (!chart || !series || !el || !wrap) return;
    const w = wrap.clientWidth - chart.priceScale('right').width();
    const h = wrap.clientHeight - chart.timeScale().height();
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.innerHTML = '';
    for (const b of bands) {
      const yTop = b.to === Infinity ? 0 : series.priceToCoordinate(b.to);
      const yBot = b.from === 0 ? h : series.priceToCoordinate(b.from);
      if (yTop == null || yBot == null) continue;
      const top = Math.max(0, Math.min(h, yTop));
      const bot = Math.max(0, Math.min(h, yBot));
      if (bot - top < 1) continue;
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:0;right:0;top:${top}px;height:${bot - top}px;background:rgba(${b.color},0.10);border-top:1px solid rgba(${b.color},0.45);border-bottom:1px solid rgba(${b.color},0.45);`;
      const t = document.createElement('span');
      t.textContent = b.label;
      t.style.cssText = `position:absolute;right:8px;top:3px;font:700 10px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:rgba(${b.color},0.95);`;
      if (bot - top > 16) d.appendChild(t);
      el.appendChild(d);
    }
  };

  useEffect(() => {
    if (!box.current) return;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7c8699', fontFamily: 'Inter, sans-serif', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)', scaleMargins: { top: 0.08, bottom: 0.06 }, mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { horzLine: { color: 'rgba(255,255,255,0.25)' }, vertLine: { color: 'rgba(255,255,255,0.25)' } },
      // Drag / scroll / pinch to explore; vertical swipes still scroll the page on phones
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: false }, axisDoubleClickReset: true },
    });
    const series = chart.addAreaSeries({
      lineColor: '#e5e7eb',
      lineWidth: 2,
      topColor: 'rgba(229,231,235,0.18)',
      bottomColor: 'rgba(229,231,235,0)',
      priceFormat: { type: 'custom', formatter: (p: number) => (p < 1e-9 ? '$0' : fmtPrice(p)), minMove: 1e-8 },
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = original();
        if (!r || !fitRef.current) return r;
        return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, fitLo), maxValue: Math.max(r.priceRange.maxValue, fitHi) } };
      },
    });
    if (ladder === 'in') {
      series.createPriceLine({ price: zo.slow[0], color: 'rgba(163,172,189,0.6)', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: 'Sell zones start' });
    } else {
      series.createPriceLine({ price: zi.slow[1], color: 'rgba(163,172,189,0.6)', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: 'Buy zones start' });
    }
    chartRef.current = chart;
    seriesRef.current = series;
    const redraw = () => requestAnimationFrame(drawBands);
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    const ro = new ResizeObserver(redraw);
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.ticker, ladder]);

  // Load data for the selected range
  useEffect(() => {
    if (!id) { setStatus('error'); return; }
    let cancelled = false;
    setStatus('loading');
    const now = Math.floor(Date.now() / 1000);
    let q: string;
    if (range === 'ALL') q = 'range=all';
    else if (range === 'CUSTOM') {
      const f = fromInput(applied.from);
      const t = Math.min(now, fromInput(applied.to) + DAY - 1);
      q = `from=${f}&to=${t}`;
    } else q = `from=${presetFrom(range, now)}&to=${now}`;

    fetch(`/api/chart/${id}?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { prices: [number, number][]; limited?: boolean }) => {
        if (cancelled || !seriesRef.current) return;
        const seen = new Set<number>();
        const data = d.prices
          .map(([t, v]) => ({ time: Math.floor(t / 1000) as UTCTimestamp, value: v }))
          .filter((p) => p.value > 0 && (seen.has(p.time) ? false : (seen.add(p.time), true)))
          .sort((a, b) => a.time - b.time);
        const span = data.length ? data[data.length - 1].time - data[0].time : 0;
        chartRef.current?.applyOptions({ timeScale: { timeVisible: span <= 10 * DAY, secondsVisible: false } });
        seriesRef.current.setData(data);
        chartRef.current?.timeScale().fitContent();
        if (data.length > 1) {
          const first = data[0], last = data[data.length - 1];
          setInfo({ change: ((last.value - first.value) / first.value) * 100, first: first.time, last: last.time, limited: !!d.limited });
        } else setInfo(null);
        setStatus(data.length ? 'ok' : 'error');
        requestAnimationFrame(() => requestAnimationFrame(drawBands));
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, range, applied, asset.ticker, ladder]);

  // Fit-zones and log toggles
  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({ autoScale: true, mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
    requestAnimationFrame(() => requestAnimationFrame(drawBands));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, log]);

  const resetZoom = () => {
    chartRef.current?.timeScale().fitContent();
    requestAnimationFrame(() => requestAnimationFrame(drawBands));
  };

  const btn = (on: boolean) => `rounded-md px-2.5 py-1 text-xs font-semibold transition ${on ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-white'}`;

  return (
    <div>
      {/* range picker */}
      <div className="-mx-1 mb-2 overflow-x-auto px-1 [scrollbar-width:none]">
        <div className="flex w-max rounded-lg bg-white/[0.04] p-0.5">
          {PRESETS.map((k) => (
            <button key={k} onClick={() => setRange(k)} className={btn(range === k)}>{k === 'ALL' ? 'All' : k}</button>
          ))}
          <button onClick={() => setRange('CUSTOM')} className={btn(range === 'CUSTOM')}>Custom</button>
        </div>
      </div>

      {range === 'CUSTOM' && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-white [color-scheme:dark]" />
          <span className="text-ink-400">to</span>
          <input type="date" value={custom.to} min={custom.from} max={toInput(today)} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-white [color-scheme:dark]" />
          <button
            onClick={() => setApplied(custom)}
            disabled={!custom.from || !custom.to || custom.from > custom.to}
            className="rounded-lg bg-white px-3 py-1.5 font-bold text-ink-950 disabled:opacity-40"
          >
            Show
          </button>
        </div>
      )}

      {/* options + period change */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
        <div className="text-ink-400 num">
          {info && status === 'ok' ? (
            <>
              <span className={`font-bold ${info.change >= 0 ? 'text-slow' : 'text-agg'}`}>{info.change >= 0 ? '+' : ''}{info.change.toFixed(1)}%</span>{' '}
              {fmtDate(info.first)} – {fmtDate(info.last)}
            </>
          ) : (
            ' '
          )}
        </div>
        <div className="flex items-center gap-3 font-medium text-ink-300">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} className="accent-teal-400" />
            Keep {ladder === 'in' ? 'buy' : 'sell'} zones in view
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} className="accent-teal-400" />
            Log scale
          </label>
          <button onClick={resetZoom} className="rounded-md border border-white/10 px-2 py-0.5 hover:text-white">Reset zoom</button>
        </div>
      </div>

      <div className="relative h-64 rounded-xl border border-white/[0.06] bg-black/20 sm:h-80">
        <div ref={box} className="absolute inset-0" />
        <div ref={overlay} className="pointer-events-none absolute left-0 top-0 overflow-hidden" />
        {status !== 'ok' && (
          <div className="absolute inset-0 grid place-items-center text-xs text-ink-400">
            {status === 'loading' ? 'Loading chart…' : 'Chart unavailable for this range right now'}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-400">
        Drag to pan, scroll or pinch to zoom.
        {info?.limited && <span className="text-mod"> Older history couldn't load right now, so this shows the last 12 months only.</span>}
      </p>
    </div>
  );
}
