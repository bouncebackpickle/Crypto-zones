import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { fmtPrice, type Asset, type Ladder } from '../lib';

interface Band { from: number; to: number; color: string; label: string }

export function PriceChart({ id, asset, ladder }: { id: string | null; asset: Asset; ladder: Ladder }) {
  const [days, setDays] = useState(90);
  const [fit, setFit] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;

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

  // Draw zone bands as an overlay positioned with the series' price->pixel mapping
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
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)', scaleMargins: { top: 0.08, bottom: 0.06 } },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: false },
      crosshair: { horzLine: { color: 'rgba(255,255,255,0.25)' }, vertLine: { color: 'rgba(255,255,255,0.25)' } },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addAreaSeries({
      lineColor: '#e5e7eb',
      lineWidth: 2,
      topColor: 'rgba(229,231,235,0.18)',
      bottomColor: 'rgba(229,231,235,0)',
      priceFormat: { type: 'custom', formatter: (p: number) => fmtPrice(p), minMove: 1e-8 },
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = original();
        if (!r || !fitRef.current) return r;
        return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, fitLo), maxValue: Math.max(r.priceRange.maxValue, fitHi) } };
      },
    });
    // Other ladder's first level as a dashed reference line
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

  useEffect(() => {
    if (!id) { setStatus('error'); return; }
    let cancelled = false;
    setStatus('loading');
    fetch(`/api/chart/${id}?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { prices: [number, number][] }) => {
        if (cancelled || !seriesRef.current) return;
        const seen = new Set<number>();
        const data = d.prices
          .map(([t, v]) => ({ time: Math.floor(t / 1000) as UTCTimestamp, value: v }))
          .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)))
          .sort((a, b) => a.time - b.time);
        seriesRef.current.setData(data);
        chartRef.current?.timeScale().fitContent();
        setStatus(data.length ? 'ok' : 'error');
        requestAnimationFrame(() => requestAnimationFrame(drawBands));
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, days, asset.ticker, ladder]);

  useEffect(() => {
    // re-run autoscale when the "fit zones" toggle flips
    chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
    chartRef.current?.timeScale().fitContent();
    requestAnimationFrame(() => requestAnimationFrame(drawBands));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex rounded-lg bg-white/[0.04] p-0.5">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${days === d ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-white'}`}
            >
              {d === 365 ? '1Y' : `${d}D`}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-300">
          <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} className="accent-teal-400" />
          Fit {ladder === 'in' ? 'buy' : 'sell'} zones in view
        </label>
      </div>
      <div className="relative h-64 rounded-xl border border-white/[0.06] bg-black/20 sm:h-72">
        <div ref={box} className="absolute inset-0" />
        <div ref={overlay} className="pointer-events-none absolute left-0 top-0 overflow-hidden" />
        {status !== 'ok' && (
          <div className="absolute inset-0 grid place-items-center text-xs text-ink-400">
            {status === 'loading' ? 'Loading chart…' : 'Chart unavailable right now'}
          </div>
        )}
      </div>
    </div>
  );
}
