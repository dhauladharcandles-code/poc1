'use client';

import { useEffect, useState } from 'react';
import { artworkDataUri, type LineItem } from '@poc/mock-data';
import { EVENTS } from '@poc/tracker';
import { useTrack } from '@poc/tracker/react';
import { StatusBadge } from '@poc/ui';

const ZOOMS = [1, 2, 4];

export function ArtworkPreview({ item, onClose }: { item: LineItem; onClose: () => void }) {
  const track = useTrack();
  const [zoom, setZoom] = useState(1);
  const a = item.artwork;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function setZ(z: number) {
    setZoom(z);
    track(EVENTS.ArtworkZoomed.name, { line_item_id: item.id, zoom: z });
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} data-track-id="artwork_preview" data-track-key={item.id} role="dialog" aria-label="Artwork preview">
        <div className="card-header">
          <div>
            <h2>{a.name}</h2>
            <div className="subtle">
              {a.id} · v{a.version} · {a.dpi} DPI · <StatusBadge status={a.status} />
            </div>
          </div>
          <div className="row">
            {ZOOMS.map((z) => (
              <button key={z} className={`btn btn-sm${zoom === z ? ' btn-primary' : ''}`} onClick={() => setZ(z)} data-track-id="artwork_preview.zoom" data-track-key={String(z)}>
                {z * 100}%
              </button>
            ))}
            <button className="icon-btn" onClick={onClose} aria-label="Close preview" data-track-id="artwork_preview.close">
              ✕
            </button>
          </div>
        </div>
        {a.note && <div className="banner banner-err" style={{ margin: 12 }}>{a.note}</div>}
        <div className="modal-stage" data-track-id="artwork_preview.stage" data-track-key={item.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artworkDataUri(a, 400)} alt={a.name} style={{ width: 360 * zoom, height: 360 * zoom, imageRendering: a.dpi < 150 ? 'pixelated' : 'auto' }} />
        </div>
      </div>
    </div>
  );
}
