'use client';

import { useState } from 'react';
import { useTracker } from '@poc/tracker/react';

/** Copies via the async clipboard API (which fires no `copy` event), so it reports the copy explicitly. */
export function CopyButton({ text, field, label = 'Copy', trackId, pii = false }: { text: string; field: string; label?: string; trackId?: string; pii?: boolean }) {
  const tracker = useTracker();
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Insecure context or no permission: fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('data-track-ignore', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    tracker?.copied(text, field, { element_id: trackId ?? `copy.${field}`, contains_pii: pii });
    setDone(true);
    setTimeout(() => setDone(false), 1_200);
  }

  return (
    <button type="button" className="btn btn-sm btn-ghost" onClick={copy} data-track-id={trackId ?? `copy.${field}`} aria-label={`${label} ${field.replace(/_/g, ' ')}`}>
      {done ? '✓ Copied' : `⧉ ${label}`}
    </button>
  );
}
