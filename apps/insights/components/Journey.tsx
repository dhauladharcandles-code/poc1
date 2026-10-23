'use client';

import { useState } from 'react';

export interface JourneyEvent {
  ts: string;
  event: string;
  page_type: string | null;
  zone: string | null;
  element_id: string | null;
  page_view_id: string | null;
  replay_id: string | null;
  properties: string;
}

const PASSIVE = new Set(['Element Viewed', 'Element Exposure Recorded', 'Engagement Time Recorded', 'Scroll Depth Reached']);
const COLOR: Record<string, string> = {
  'Content Copied': 'var(--series-5, #e87ba4)',
  'Page Left': 'var(--series-2)',
  'Page Returned': 'var(--series-2)',
  'Agent Idle': 'var(--series-4)',
  'Agent Active': 'var(--series-4)',
  'Rage Click Detected': 'var(--status-critical)',
  'Dead Click Detected': 'var(--status-critical)',
  'Find In Page Used': 'var(--status-critical)',
  'Error Encountered': 'var(--status-critical)',
  'Empty State Shown': 'var(--status-serious)',
  'Page Viewed': 'var(--text)',
};
const KEYS = ['element_id', 'field', 'method', 'detected_type', 'filter', 'to', 'trigger', 'away_ms', 'leave_type', 'away_type', 'last_action', 'kind', 'reason', 'depth_pct', 'container', 'idle_ms', 'engaged_ms', 'open_ms', 'rows_viewed', 'zoom', 'carrier', 'milestone', 'load_type'];

export function Journey({ events }: { events: JourneyEvent[] }) {
  const [showPassive, setShowPassive] = useState(false);
  const t0 = events.length ? new Date(events[0].ts).getTime() : 0;
  const shown = events.filter((e) => showPassive || !PASSIVE.has(e.event));
  let lastPv: string | null = null;
  return (
    <div>
      <label className="row subtle" style={{ gap: 6, marginBottom: 8 }}>
        <input type="checkbox" checked={showPassive} onChange={(e) => setShowPassive(e.target.checked)} /> Show viewability / scroll / heartbeat events ({events.length - events.filter((e) => !PASSIVE.has(e.event)).length})
      </label>
      <ol className="journey">
        {shown.map((e, i) => {
          let props: Record<string, unknown> = {};
          try {
            props = JSON.parse(e.properties);
          } catch {
            /* ignore */
          }
          const sep = e.page_view_id !== lastPv;
          lastPv = e.page_view_id;
          const rel = (new Date(e.ts).getTime() - t0) / 1000;
          const summary = KEYS.filter((k) => props[k] !== undefined && props[k] !== null && props[k] !== '')
            .map((k) => `${k}=${typeof props[k] === 'object' ? JSON.stringify(props[k]) : String(props[k])}`)
            .join('  ');
          return (
            <li key={i}>
              {sep && <div className="pv">{e.zone} · {e.page_type}</div>}
              <span className="t">+{rel.toFixed(1)}s</span>
              <span className="dot" style={{ background: COLOR[e.event] ?? 'var(--series-1)' }} />
              <span>
                <span className="name">{e.event}</span>
                {summary && <div className="props">{summary}</div>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
