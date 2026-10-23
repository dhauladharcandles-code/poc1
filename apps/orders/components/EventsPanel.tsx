'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate, fmtDateTime, type EventCategory, type Order, type OrderEvent } from '@poc/mock-data';
import { EVENTS } from '@poc/tracker';
import { useEmptyState, useTrack } from '@poc/tracker/react';
import { Badge } from '@poc/ui';

export interface PanelState {
  filter: EventCategory | 'all';
  lineItemId: string | null;
  openedAt: number;
  trigger: string;
}

const TABS: { key: EventCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'production', label: 'Production' },
  { key: 'artwork', label: 'Artwork' },
  { key: 'payment', label: 'Payment' },
  { key: 'support', label: 'Support' },
  { key: 'order', label: 'Order' },
];

/** The order's event history in a drawer. Its list is a tracked scroll container and every row is a tracked element. */
export function EventsPanel({
  order,
  state,
  onChange,
  onClose,
}: {
  order: Order;
  state: PanelState;
  onChange: (s: PanelState) => void;
  onClose: () => void;
}) {
  const track = useTrack();
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  const maxScroll = useRef(0);
  const openedAt = useRef(state.openedAt || Date.now());
  const [expanded, setExpanded] = useState<string | null>(null);

  const scoped = useMemo(
    () => (state.lineItemId ? order.events.filter((e) => e.lineItemId === state.lineItemId || (!e.lineItemId && e.category === 'shipping')) : order.events),
    [order.events, state.lineItemId],
  );
  const rows = state.filter === 'all' ? scoped : scoped.filter((e) => e.category === state.filter);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: scoped.length };
    for (const e of scoped) c[e.category] = (c[e.category] ?? 0) + 1;
    return c;
  }, [scoped]);
  const item = order.lineItems.find((li) => li.id === state.lineItemId);

  useEmptyState(rows.length === 0, 'events_panel.list', `no_${state.filter}_events`, { filter: state.filter, line_item_id: state.lineItemId });

  // Rows actually seen (≥60% visible) — reported when the panel closes.
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => en.isIntersecting && seen.current.add((en.target as HTMLElement).dataset.trackKey ?? '')),
      { root, threshold: 0.6 },
    );
    root.querySelectorAll('[data-track-id="events_panel.row"]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rows]);

  function close(method: string) {
    track(EVENTS.EventsPanelClosed.name, {
      open_ms: Date.now() - openedAt.current,
      rows_viewed: seen.current.size,
      max_scroll_pct: Math.round(maxScroll.current),
      close_method: method,
      filter: state.filter,
    });
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close('escape');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function setFilter(to: EventCategory | 'all') {
    if (to === state.filter) return;
    const count = to === 'all' ? scoped.length : scoped.filter((e) => e.category === to).length;
    track(EVENTS.EventsFilterChanged.name, { from: state.filter, to, result_count: count, line_item_id: state.lineItemId });
    onChange({ ...state, filter: to });
    listRef.current?.scrollTo({ top: 0 });
  }

  function toggleRow(e: OrderEvent) {
    if (expanded !== e.id) {
      track(EVENTS.EventRowExpanded.name, {
        event_id: e.id,
        category: e.category,
        severity: e.severity,
        age_hours: Math.round((Date.now() - new Date(e.at).getTime()) / 3_600_000),
      });
    }
    setExpanded(expanded === e.id ? null : e.id);
  }

  let lastDay = '';
  return (
    <>
      <div className="backdrop" onClick={() => close('backdrop')} />
      <aside className="drawer" role="dialog" aria-label="Order events" data-track-id="events_panel" data-track-section="events_panel">
        <div className="drawer-head">
          <div>
            <h2>Order events</h2>
            <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              <span className="subtle mono">{order.id}</span>
              {item && (
                <span className="badge badge-accent">
                  {item.name}
                  <button
                    onClick={() => onChange({ ...state, lineItemId: null })}
                    style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, marginLeft: 4 }}
                    aria-label="Show events for all items"
                    data-track-id="events_panel.clear_scope"
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>
          </div>
          <button className="icon-btn" onClick={() => close('close_button')} aria-label="Close events" data-track-id="events_panel.close">
            ✕
          </button>
        </div>
        <div className="tabs" role="tablist" data-track-id="events_panel.tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              className="tab"
              aria-selected={state.filter === t.key}
              onClick={() => setFilter(t.key)}
              data-track-id="events_panel.tab"
              data-track-key={t.key}
            >
              {t.label}
              <span className="count">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div
          className="drawer-list"
          ref={listRef}
          data-track-scroll="events_panel"
          data-track-id="events_panel.list"
          onScroll={(e) => {
            const el = e.currentTarget;
            maxScroll.current = Math.max(maxScroll.current, ((el.scrollTop + el.clientHeight) / el.scrollHeight) * 100);
          }}
        >
          {rows.length === 0 && (
            <div className="empty">
              <strong>No {state.filter === 'all' ? '' : state.filter} events yet</strong>
              {state.filter === 'shipping' ? 'The carrier has not scanned this package.' : 'Nothing recorded for this filter.'}
            </div>
          )}
          {rows.map((e) => {
            const day = fmtDate(e.at);
            const sep = day !== lastDay;
            lastDay = day;
            return (
              <div key={e.id}>
                {sep && <div className="day-sep">{day}</div>}
                <button className="ev" onClick={() => toggleRow(e)} data-track-id="events_panel.row" data-track-key={e.id} data-track-view-event="off" aria-expanded={expanded === e.id}>
                  <span className={`pip ${e.severity}`} />
                  <span>
                    <span className="title">{e.title}</span>
                    <span className="meta">
                      <span>{fmtDateTime(e.at)}</span>
                      <Badge>{e.category}</Badge>
                      <span>by {e.actor}</span>
                    </span>
                    <span className="desc" style={{ display: 'block' }} data-track-field="event_description" {...(e.category === 'support' ? { 'data-pii': '' } : {})}>
                      {e.description}
                    </span>
                  </span>
                </button>
                {expanded === e.id && (
                  <div className="ev-detail mono" data-track-id="events_panel.row_detail" data-track-key={e.id}>
                    <div>
                      id: <span data-track-field="event_id">{e.id}</span>
                    </div>
                    <div>at: {e.at}</div>
                    {e.lineItemId && <div>line item: {e.lineItemId}</div>}
                    {e.meta && <div>meta: {JSON.stringify(e.meta)}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
