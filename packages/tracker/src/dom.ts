/**
 * DOM conventions the tracker relies on (any micro frontend can opt in with plain attributes):
 *
 *   data-track-id="line_item.card"   stable, type-level id used for aggregation & heatmap anchoring
 *   data-track-key="li_10482_1"      instance key (which line item)
 *   data-track-section="line_items"  page section for scroll maps
 *   data-track-field="tracking_number" semantic field name for copy/select analytics
 *   data-track-hover                 emit Element Hovered after hover intent
 *   data-track-scroll="events_panel" scroll container whose depth we measure
 *   data-pii                         masked in replay; copied text is never classified beyond "pii"
 *   data-track-ignore                tracker & replay ignore this subtree (e.g. the inspector)
 */

export interface Anchor {
  el: Element;
  element_id: string;
  element_key: string | null;
  section: string | null;
}

export function closestAnchor(node: Node | null): Anchor | null {
  const el = toElement(node)?.closest('[data-track-id]');
  if (!el) return null;
  return {
    el,
    element_id: el.getAttribute('data-track-id')!,
    element_key: el.getAttribute('data-track-key'),
    section: sectionOf(el),
  };
}

export function sectionOf(el: Element): string | null {
  return el.closest('[data-track-section]')?.getAttribute('data-track-section') ?? null;
}

export function toElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

export function isIgnored(node: Node | null): boolean {
  return !!toElement(node)?.closest('[data-track-ignore]');
}

export function isPii(node: Node | null): boolean {
  return !!toElement(node)?.closest('[data-pii]');
}

const INTERACTIVE =
  'a[href],button,input,select,textarea,label,summary,details,[role=button],[role=tab],[role=link],[role=menuitem],[role=checkbox],[role=switch],[tabindex]:not([tabindex="-1"]),[data-track-clickable]';

export function interactiveTarget(node: Node | null): Element | null {
  return toElement(node)?.closest(INTERACTIVE) ?? null;
}

export function fieldOf(node: Node | null): { field: string; el: Element } | null {
  const el = toElement(node)?.closest('[data-track-field]');
  return el ? { field: el.getAttribute('data-track-field')!, el } : null;
}

/** Short, non-PII label for the clicked thing (button text, aria-label). */
export function safeText(el: Element | null, max = 40): string | null {
  if (!el || isPii(el)) return null;
  const label = el.getAttribute('aria-label') ?? (el as HTMLElement).innerText ?? el.textContent ?? '';
  const t = label.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Classifies a piece of text without sending it anywhere. */
export function detectType(text: string): string {
  const t = text.trim();
  if (!t) return 'empty';
  if (/^ORD-\d{4,}$/i.test(t)) return 'order_id';
  if (/^1Z[0-9A-Z]{16}$/i.test(t) || /^\d{12,22}$/.test(t) || /^[A-Z]{2}\d{9,}[A-Z]{0,2}$/i.test(t) || /^JD\d{18}$/i.test(t))
    return 'tracking_number';
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) return 'email';
  if (/^\+?[\d\s().-]{10,}$/.test(t)) return 'phone';
  if (/^\$?\s?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(t)) return 'money';
  if (/^[A-Z]{2,5}(-[A-Z0-9]{1,5}){1,4}$/.test(t)) return 'sku';
  if (/\d+\s+\w+.*\b(st|street|rd|road|ave|avenue|blvd|dr|drive|ln|way|ct|pl)\b/i.test(t)) return 'address';
  if (/^(evt|li|art|shp|cus)_\w+$/i.test(t)) return 'internal_id';
  if (t.split(/\s+/).length > 6) return 'sentence';
  return 'text';
}

/** FNV-1a 32-bit — lets us count "the same thing copied twice" without storing the text. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function docHeight(): number {
  const d = document.documentElement;
  return Math.max(d.scrollHeight, document.body?.scrollHeight ?? 0, d.clientHeight);
}

export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
