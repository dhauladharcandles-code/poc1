'use client';

import { useState, type ReactNode } from 'react';

type Tip = { x: number; y: number; content: ReactNode } | null;

function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const bind = (content: ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX + 14, y: e.clientY + 14, content }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  ) : null;
  return { bind, node };
}

export interface BarDatum {
  label: string;
  value: number;
  display?: string;
  detail?: ReactNode;
}

/** Single-series horizontal bars: value label at the tip, hover tooltip, optional table view. */
export function BarList({ data, max, unit = '', tone = 'primary', emptyText = 'No data yet' }: { data: BarDatum[]; max?: number; unit?: string; tone?: 'primary' | 'alt'; emptyText?: string }) {
  const { bind, node } = useTip();
  const [table, setTable] = useState(false);
  const m = max ?? Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="empty">{emptyText}</div>;
  return (
    <div className="viz-root">
      {table ? (
        <table className="table">
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td className="num">{d.display ?? `${d.value}${unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="bars">
          {data.map((d) => (
            <div className="row-hit" key={d.label} {...bind(<><b>{d.label}</b><br />{d.display ?? `${d.value}${unit}`}{d.detail ? <><br />{d.detail}</> : null}</>)}>
              <span className="lbl" title={d.label}>{d.label}</span>
              <span className="track">
                <span className={`fill${tone === 'alt' ? ' alt' : ''}`} style={{ width: `${Math.max(0, (d.value / m) * 100)}%` }} />
              </span>
              <span className="val">{d.display ?? `${d.value}${unit}`}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <button className="toggle-table" onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {node}
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  color: string;
  display: string;
}

/** One stacked bar (parts of a whole) with a legend that always carries the values. */
export function StackedBar({ segments }: { segments: Segment[] }) {
  const { bind, node } = useTip();
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <div className="empty">No time recorded yet</div>;
  return (
    <div className="viz-root">
      <div className="stack-bar" role="img" aria-label={segments.map((s) => `${s.label} ${s.display}`).join(', ')}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.label}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              {...bind(<><b>{s.label}</b><br />{s.display} · {Math.round((s.value / total) * 100)}%</>)}
            />
          ))}
      </div>
      <div className="legend">
        {segments.map((s) => (
          <span key={s.label}>
            <span className="sw" style={{ background: s.color }} />
            {s.label} <b style={{ color: 'var(--text)' }}>{s.display}</b> ({Math.round((s.value / total) * 100)}%)
          </span>
        ))}
      </div>
      {node}
    </div>
  );
}

/** Two series side by side per category (e.g. inferred vs ticket-labelled). */
export function PairedBars({ rows, a, b }: { rows: { label: string; a: number; b: number }[]; a: string; b: string }) {
  const { bind, node } = useTip();
  const m = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  if (!rows.length) return <div className="empty">No investigations yet</div>;
  return (
    <div className="viz-root">
      <div className="legend" style={{ marginTop: 0, marginBottom: 10 }}>
        <span>
          <span className="sw" style={{ background: 'var(--series-1)' }} />
          {a}
        </span>
        <span>
          <span className="sw" style={{ background: 'var(--series-2)' }} />
          {b}
        </span>
      </div>
      <div className="bars">
        {rows.map((r) => (
          <div className="row-hit" key={r.label} {...bind(<><b>{r.label}</b><br />{a}: {r.a}<br />{b}: {r.b}</>)}>
            <span className="lbl">{r.label}</span>
            <span className="track" style={{ height: 30 }}>
              <span className="fill" style={{ width: `${(r.a / m) * 100}%`, top: 1, height: 12 }} />
              <span className="fill alt" style={{ width: `${(r.b / m) * 100}%`, top: 16, height: 12 }} />
            </span>
            <span className="val">
              {r.a} / {r.b}
            </span>
          </div>
        ))}
      </div>
      {node}
    </div>
  );
}
