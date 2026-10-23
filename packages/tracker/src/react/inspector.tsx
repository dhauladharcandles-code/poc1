'use client';

import { useState, type CSSProperties } from 'react';
import { useTrackedEvents, useTracker } from './index';

const HIGHLIGHT_KEYS = ['element_id', 'field', 'container', 'depth_pct', 'away_ms', 'leave_type', 'method', 'detected_type', 'kind', 'to', 'engaged_ms', 'reason', 'order_id'];

const colors: Record<string, string> = {
  'Element Clicked': '#2563eb',
  'Element Viewed': '#059669',
  'Element Exposure Recorded': '#059669',
  'Scroll Depth Reached': '#0891b2',
  'Content Copied': '#c026d3',
  'Content Pasted': '#c026d3',
  'Text Selected': '#a21caf',
  'Page Left': '#d97706',
  'Page Returned': '#d97706',
  'Agent Idle': '#78716c',
  'Agent Active': '#78716c',
  'Engagement Time Recorded': '#78716c',
  'Rage Click Detected': '#dc2626',
  'Dead Click Detected': '#dc2626',
  'Find In Page Used': '#dc2626',
  'Error Encountered': '#dc2626',
  'Empty State Shown': '#ea580c',
};

/**
 * Floating, collapsible live view of what the tracker is sending. Marked data-track-ignore so it
 * is excluded from heatmaps, clicks and replay.
 */
export function TrackerInspector() {
  const tracker = useTracker();
  const events = useTrackedEvents();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!tracker?.isEnabled()) return null;

  const cfg = tracker.config;
  const shown = events.filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()));

  const box: CSSProperties = {
    position: 'fixed',
    left: 16,
    bottom: 16,
    zIndex: 2147483000,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
  };

  if (!open) {
    return (
      <div data-track-ignore style={box}>
        <button
          onClick={() => setOpen(true)}
          style={{ background: '#111827', color: '#fff', border: 0, borderRadius: 999, padding: '8px 14px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.25)' }}
        >
          ● Tracking · {events.length}
        </button>
      </div>
    );
  }

  return (
    <div
      data-track-ignore
      style={{ ...box, width: 420, maxHeight: '60vh', display: 'flex', flexDirection: 'column', background: '#0b1020', color: '#e5e7eb', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.35)', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #1f2937' }}>
        <strong style={{ flex: 1 }}>Live tracking · {cfg.zone}</strong>
        <button onClick={() => setOpen(false)} style={{ background: 'transparent', color: '#9ca3af', border: 0, cursor: 'pointer', fontSize: 14 }} aria-label="Close inspector">
          ✕
        </button>
      </div>
      <div style={{ padding: '6px 12px', color: '#9ca3af', borderBottom: '1px solid #1f2937', lineHeight: 1.6 }}>
        Segment: {cfg.segment?.writeKey ? 'live write key' : 'local collector'} · New Relic: {cfg.newRelic ? 'on' : 'off (no keys)'} · Replay: {cfg.replay === false ? 'off' : 'rrweb'}
        <br />
        investigation: {tracker.getContext().investigation_id?.slice(0, 8) ?? '—'} · tab: {tracker.getContext().tab_id.slice(0, 8)}
      </div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter events…"
        style={{ margin: 8, padding: '6px 8px', background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6 }}
      />
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto' }}>
        {shown.map((e, i) => {
          const hl = HIGHLIGHT_KEYS.filter((k) => e.props[k] !== undefined && e.props[k] !== null)
            .slice(0, 3)
            .map((k) => `${k}=${String(e.props[k])}`)
            .join(' ');
          return (
            <li key={`${e.at}-${i}`} style={{ borderBottom: '1px solid #111827' }}>
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', color: 'inherit', border: 0, padding: '6px 12px', cursor: 'pointer', font: 'inherit' }}
              >
                <span style={{ color: '#6b7280' }}>{new Date(e.at).toLocaleTimeString()}</span>{' '}
                <span style={{ color: colors[e.name] ?? (e.type === 'page' ? '#facc15' : '#e5e7eb'), fontWeight: 600 }}>
                  {e.type === 'page' ? `page: ${e.name}` : e.type === 'identify' ? `identify: ${e.name}` : e.name}
                </span>
                {hl && <div style={{ color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hl}</div>}
              </button>
              {expanded === i && (
                <pre style={{ margin: 0, padding: '6px 12px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#a5b4fc', fontSize: 11 }}>
                  {JSON.stringify(e.props, null, 2)}
                </pre>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
