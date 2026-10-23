'use client';

import { fmtDate, type EventCategory, type MilestoneKey, type Order } from '@poc/mock-data';
import { EVENTS } from '@poc/tracker';
import { useTrack } from '@poc/tracker/react';
import type { OpenPanel } from './OrderDetail';

const STAGE_FILTER: Record<MilestoneKey, EventCategory> = {
  placed: 'order',
  paid: 'payment',
  artwork_approved: 'artwork',
  in_production: 'production',
  shipped: 'shipping',
  out_for_delivery: 'shipping',
  delivered: 'shipping',
};

export function OrderTimeline({ order, onOpenEvents }: { order: Order; onOpenEvents: OpenPanel }) {
  const track = useTrack();
  return (
    <section className="card" data-track-id="order_timeline" data-track-section="timeline" aria-label="Order timeline">
      <div className="stepper">
        {order.milestones.map((m, i) => (
          <button
            key={m.key}
            className={`step ${m.state}`}
            data-track-id="order_timeline.step"
            data-track-key={m.key}
            onClick={() => {
              track(EVENTS.TimelineStepClicked.name, { milestone: m.key, milestone_state: m.state });
              onOpenEvents('timeline_step', STAGE_FILTER[m.key]);
            }}
            title={`Show ${STAGE_FILTER[m.key]} events`}
          >
            <span className="dot">{m.state === 'done' ? '✓' : m.state === 'blocked' ? '!' : i + 1}</span>
            <span className="label">{m.label}</span>
            <span className="when">{m.at ? fmtDate(m.at) : m.state === 'blocked' ? 'Blocked' : '—'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
