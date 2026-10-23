'use client';

import { useState } from 'react';
import { artworkDataUri, daysBetween, fmtDate, fmtDateTime, fmtMoney, type LineItem, type Order } from '@poc/mock-data';
import { EVENTS } from '@poc/tracker';
import { useEmptyState, useTrack } from '@poc/tracker/react';
import { Badge, StatusBadge } from '@poc/ui';
import { CopyButton } from './CopyButton';
import type { OpenPanel } from './OrderDetail';

export function LineItemCard({
  item,
  order,
  onOpenEvents,
  onPreview,
}: {
  item: LineItem;
  order: Order;
  onOpenEvents: OpenPanel;
  onPreview: (li: LineItem) => void;
}) {
  const track = useTrack();
  const [expanded, setExpanded] = useState(false);
  const slip = daysBetween(item.eta.promised, item.eta.current);
  const itemEvents = order.events.filter((e) => e.lineItemId === item.id || (!e.lineItemId && e.category === 'shipping'));
  const s = item.shipment;
  const noScans = !!s && !s.lastScan;
  useEmptyState(noScans, 'line_item.shipment', 'no_carrier_scans', { line_item_id: item.id, carrier: s?.carrier });
  useEmptyState(!s, 'line_item.shipment', 'not_shipped', { line_item_id: item.id });

  function toggle() {
    if (!expanded) track(EVENTS.LineItemExpanded.name, { line_item_id: item.id, product_type: item.productType, shipment_status: s?.status ?? 'not_shipped' });
    setExpanded((v) => !v);
  }

  return (
    <article className="card" data-track-id="line_item.card" data-track-key={item.id}>
      <div className="li">
        <button
          className="artwork-thumb"
          data-track-id="line_item.artwork"
          data-track-key={item.id}
          onClick={() => {
            track(EVENTS.ArtworkPreviewOpened.name, { line_item_id: item.id, artwork_status: item.artwork.status, artwork_dpi: item.artwork.dpi });
            onPreview(item);
          }}
          aria-label={`Preview artwork ${item.artwork.name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artworkDataUri(item.artwork, 224)} alt={item.artwork.name} />
          {item.artwork.status !== 'approved' && (
            <span className="flag">
              <StatusBadge status={item.artwork.status} />
            </span>
          )}
        </button>

        <div>
          <h3>{item.name}</h3>
          <div className="subtle">
            <span className="mono" data-track-field="sku">
              {item.sku}
            </span>{' '}
            · {Object.entries(item.options).map(([k, v]) => `${k}: ${v}`).join(' · ')}
          </div>
          <dl className="kv">
            <dt>Qty</dt>
            <dd>
              {item.quantity} × {fmtMoney(item.unitPrice)} = <b>{fmtMoney(item.quantity * item.unitPrice)}</b>
            </dd>
            <dt>Artwork</dt>
            <dd>
              {item.artwork.name} <span className="subtle">v{item.artwork.version}</span>
            </dd>
            <dt>Production</dt>
            <dd>
              <StatusBadge status={item.production.status} /> <span className="subtle">{item.production.facility}</span>
            </dd>
          </dl>
        </div>

        <div className="eta" data-track-id="line_item.eta" data-track-key={item.id} data-track-hover>
          <div className="section-title">Estimated delivery</div>
          <div>
            <span className="big">{fmtDate(item.eta.current)}</span>
            {slip !== 0 && <span className="was">{fmtDate(item.eta.promised)}</span>}
          </div>
          <div className="row" style={{ marginTop: 4, flexWrap: 'wrap' }}>
            {slip > 0 && <Badge tone="warn">+{slip}d late</Badge>}
            <Badge tone={item.eta.confidence === 'high' ? 'ok' : item.eta.confidence === 'medium' ? 'warn' : 'err'}>{item.eta.confidence} confidence</Badge>
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="why">
              ⓘ Why this date?
              <span className="tip">
                {item.eta.reason ?? 'On schedule.'} Promised {fmtDate(item.eta.promised)}; current estimate {fmtDate(item.eta.current)} based on {s ? `${s.carrier} transit times` : 'production queue'}.
              </span>
            </span>
          </div>
        </div>

        <div data-track-id="line_item.shipment" data-track-key={item.id}>
          <div className="section-title">Shipment</div>
          {s ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <b>{s.carrier}</b>
                <StatusBadge status={s.status} />
              </div>
              <div className="row" data-track-id="line_item.tracking_number" data-track-key={item.id}>
                {/* Deliberately plain text: lets the POC show dead clicks when agents expect a link. */}
                <span className="tracking-no" data-track-field="tracking_number">
                  {s.trackingNumber}
                </span>
                <CopyButton text={s.trackingNumber} field="tracking_number" trackId="copy.tracking_number" />
              </div>
              {s.lastScan ? (
                <div className="subtle" data-track-id="line_item.last_scan" data-track-key={item.id}>
                  Last scan {fmtDateTime(s.lastScan.at)}
                  <br />
                  {s.lastScan.description} — {s.lastScan.location}
                </div>
              ) : (
                <div className="subtle">No carrier scans yet. Label created, awaiting pickup.</div>
              )}
              <div>
                <a
                  className="btn btn-sm"
                  href={s.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-track-id="line_item.carrier_link"
                  data-track-key={item.id}
                  onClick={() => track(EVENTS.TrackingLinkClicked.name, { line_item_id: item.id, carrier: s.carrier, shipment_status: s.status })}
                >
                  Track on {s.carrier} ↗
                </a>
              </div>
            </div>
          ) : (
            <div className="subtle">Not shipped yet — still in production.</div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="li-details" data-track-id="line_item.details" data-track-key={item.id}>
          <div className="grid-3">
            <div>
              <div className="section-title">Artwork file</div>
              <div>
                {item.artwork.id} · v{item.artwork.version} · {item.artwork.dpi} DPI
              </div>
              <div>
                Status: <StatusBadge status={item.artwork.status} />
              </div>
              {item.artwork.note && <div className="banner banner-err" style={{ marginTop: 6 }}>{item.artwork.note}</div>}
            </div>
            <div>
              <div className="section-title">Fulfilment</div>
              <div>Facility: {item.production.facility}</div>
              <div>Shipment: {s?.id ?? '—'}</div>
            </div>
            <div>
              <div className="section-title">Palette</div>
              <div className="row">
                {item.artwork.palette.map((c) => (
                  <span key={c} title={c} style={{ width: 20, height: 20, borderRadius: 4, background: c, border: '1px solid var(--border)' }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="li-foot">
        <button className="btn btn-sm" onClick={() => onOpenEvents('line_item', 'all', item.id)} data-track-id="line_item.view_events" data-track-key={item.id}>
          View item events ({itemEvents.length})
        </button>
        <button className="btn btn-sm btn-ghost" onClick={toggle} data-track-id="line_item.details_toggle" data-track-key={item.id}>
          {expanded ? 'Hide details ▴' : 'Details ▾'}
        </button>
      </div>
    </article>
  );
}
