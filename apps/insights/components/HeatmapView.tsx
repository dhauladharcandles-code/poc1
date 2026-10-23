'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtMs } from './format';

export interface ElementStat {
  element_id: string;
  page_views: number;
  view_rate_pct: number | null;
  avg_visible_ms_per_pv: number | null;
  avg_hover_ms_per_pv: number | null;
  clicks: number;
  rage_clicks: number;
  dead_clicks: number;
  copies: number;
  selections: number;
}

export interface ClickPoint {
  element_id: string;
  element_key: string | null;
  x_rel: number | null;
  y_rel: number | null;
  is_interactive: boolean;
}

type Mode = 'clicks' | 'attention' | 'views' | 'hover' | 'friction';

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'clicks', label: 'Clicks', hint: 'Click density, anchored to the element that was clicked' },
  { key: 'attention', label: 'Time in view', hint: 'Average ms the element was ≥50% visible per page view' },
  { key: 'views', label: 'View rate', hint: '% of page views where the element was viewed (≥50% for ≥1s)' },
  { key: 'hover', label: 'Hover', hint: 'Average hover ms per page view' },
  { key: 'friction', label: 'Frustration', hint: 'Rage + dead clicks on the element' },
];

// Containers that would just cover everything.
const SKIP = new Set(['order_page', 'line_item.card', 'app_header', 'agent_picker', 'order_timeline', 'events_panel', 'events_panel.list', 'order_header', 'address_card']);

/** Single-hue sequential ramps (light → dark). Blue for zones, orange for click density, red family for frustration. */
const BLUE = [205, 226, 251, 24, 79, 149];
const ORANGE = [253, 228, 217, 154, 52, 18];

function lerpColor(ramp: number[], t: number, alpha: number) {
  const c = (i: number) => Math.round(ramp[i] + (ramp[i + 3] - ramp[i]) * t);
  return `rgba(${c(0)}, ${c(1)}, ${c(2)}, ${alpha})`;
}

function metric(s: ElementStat, mode: Mode): number {
  switch (mode) {
    case 'attention':
      return s.avg_visible_ms_per_pv ?? 0;
    case 'views':
      return s.view_rate_pct ?? 0;
    case 'hover':
      return s.avg_hover_ms_per_pv ?? 0;
    case 'friction':
      return s.rage_clicks + s.dead_clicks;
    default:
      return s.clicks;
  }
}

function fmtMetric(v: number, mode: Mode) {
  if (mode === 'views') return `${v.toFixed(0)}%`;
  if (mode === 'friction') return `${v}`;
  if (mode === 'clicks') return `${v} clicks`;
  return fmtMs(v);
}

interface Zone {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  t: number;
  stat: ElementStat;
  value: number;
}

export function HeatmapView({ stats, points, orders }: { stats: ElementStat[]; points: ClickPoint[]; orders: { id: string; label: string }[] }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? 'ORD-10482');
  const [mode, setMode] = useState<Mode>('clicks');
  const [panel, setPanel] = useState(false);
  const [height, setHeight] = useState(1400);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; z: Zone } | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(doc.documentElement.scrollHeight, 600);
    if (Math.abs(h - height) > 4) setHeight(h);

    const rectOf = (el: Element) => el.getBoundingClientRect();

    // Zones
    if (mode !== 'clicks') {
      const rows = stats.filter((s) => !SKIP.has(s.element_id) && metric(s, mode) > 0);
      const max = Math.max(1, ...rows.map((s) => metric(s, mode)));
      const out: Zone[] = [];
      for (const s of rows) {
        doc.querySelectorAll(`[data-track-id="${CSS.escape(s.element_id)}"]`).forEach((el, i) => {
          const r = rectOf(el);
          if (r.width < 4 || r.height < 4) return;
          const v = metric(s, mode);
          out.push({ key: `${s.element_id}-${i}`, left: r.left, top: r.top, width: r.width, height: r.height, t: v / max, stat: s, value: v });
        });
      }
      // Big boxes first so small ones stay hoverable on top.
      out.sort((a, b) => b.width * b.height - a.width * a.height);
      setZones(out);
    } else setZones([]);

    // Click density
    const c = canvas.current;
    if (!c) return;
    const w = frame.current!.clientWidth;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (mode !== 'clicks') return;
    const radius = 22;
    for (const p of points) {
      if (p.x_rel === null || p.y_rel === null) continue;
      const sel = `[data-track-id="${CSS.escape(p.element_id)}"]`;
      const el = (p.element_key && doc.querySelector(`${sel}[data-track-key="${CSS.escape(p.element_key)}"]`)) || doc.querySelector(sel);
      if (!el) continue;
      const r = rectOf(el);
      const x = r.left + p.x_rel * r.width;
      const y = r.top + p.y_rel * r.height;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    // Colourise accumulated alpha with the single-hue orange ramp.
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      if (a < 0.02) continue;
      const t = Math.min(1, a * 1.4);
      d[i] = ORANGE[0] + (ORANGE[3] - ORANGE[0]) * t;
      d[i + 1] = ORANGE[1] + (ORANGE[4] - ORANGE[1]) * t;
      d[i + 2] = ORANGE[2] + (ORANGE[5] - ORANGE[2]) * t;
      d[i + 3] = Math.min(235, 60 + a * 255);
    }
    ctx.putImageData(img, 0, 0);
  }, [mode, stats, points, height]);

  useEffect(() => {
    const t = setTimeout(draw, 50);
    return () => clearTimeout(t);
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const src = `/orders/${orderId}?__no_track=1${panel ? '&events=open' : ''}`;
  const current = MODES.find((m) => m.key === mode)!;

  return (
    <div className="stack">
      <div className="hm-controls">
        <select className="input" style={{ width: 280 }} value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label="Order to render">
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="seg" role="group" aria-label="Heatmap mode">
          {MODES.map((m) => (
            <button key={m.key} aria-pressed={mode === m.key} onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <label className="row subtle" style={{ gap: 6 }}>
          <input type="checkbox" checked={panel} onChange={(e) => setPanel(e.target.checked)} /> Show events panel
        </label>
        <span style={{ flex: 1 }} />
        <span className="row subtle" style={{ gap: 8 }}>
          low
          <span
            className="ramp"
            style={{
              background:
                mode === 'clicks'
                  ? `linear-gradient(90deg, ${lerpColor(ORANGE, 0, 1)}, ${lerpColor(ORANGE, 1, 1)})`
                  : mode === 'friction'
                    ? 'linear-gradient(90deg, rgba(208,59,59,.15), rgba(208,59,59,.8))'
                    : `linear-gradient(90deg, ${lerpColor(BLUE, 0, 0.5)}, ${lerpColor(BLUE, 1, 0.75)})`,
            }}
          />
          high
        </span>
      </div>
      <div className="subtle">{current.hint}. Aggregated across all orders; rendered on the order selected above.</div>
      <div className="hm-wrap viz-root" style={{ height }}>
        <iframe ref={frame} src={src} title="Order page" style={{ height }} onLoad={() => setTimeout(draw, 400)} />
        <canvas ref={canvas} className="hm-overlay" style={{ pointerEvents: 'none' }} />
        <div className="hm-overlay" style={{ pointerEvents: 'none' }}>
          {zones.map((z) => (
            <div
              key={z.key}
              className="hm-zone"
              style={{
                left: z.left,
                top: z.top,
                width: z.width,
                height: z.height,
                background: mode === 'friction' ? `rgba(208, 59, 59, ${0.12 + 0.5 * z.t})` : lerpColor(BLUE, z.t, 0.18 + 0.5 * z.t),
                borderColor: mode === 'friction' ? 'rgba(208,59,59,.9)' : lerpColor(BLUE, 1, 0.6),
              }}
              onMouseMove={(e) => setTip({ x: e.clientX + 14, y: e.clientY + 14, z })}
              onMouseLeave={() => setTip(null)}
            >
              {z.width > 60 && z.height > 16 && <span className="tag">{fmtMetric(z.value, mode)}</span>}
            </div>
          ))}
        </div>
      </div>
      {tip && (
        <div className="viz-tip" style={{ left: tip.x, top: tip.y }}>
          <b className="mono">{tip.z.stat.element_id}</b>
          <br />
          view rate {tip.z.stat.view_rate_pct ?? 0}% · in view {fmtMs(tip.z.stat.avg_visible_ms_per_pv)}/pv
          <br />
          hover {fmtMs(tip.z.stat.avg_hover_ms_per_pv)}/pv · {tip.z.stat.clicks} clicks · {tip.z.stat.copies} copies
          <br />
          {tip.z.stat.dead_clicks} dead · {tip.z.stat.rage_clicks} rage clicks
        </div>
      )}
    </div>
  );
}
