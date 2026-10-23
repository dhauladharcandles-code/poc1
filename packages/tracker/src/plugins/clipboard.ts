import { EVENTS } from '../tracking-plan';
import { closestAnchor, detectType, fieldOf, hashText, isIgnored, isPii, toElement } from '../dom';
import type { Plugin, TrackerApi } from '../types';

/**
 * Copy, cut, paste and text selection. The copied text itself never leaves the browser:
 * we send the semantic field, a detected type, the length and a non-reversible hash.
 */
export function clipboardPlugin(): Plugin {
  let tracker: TrackerApi;
  let lastCopyKeyAt = 0;
  let lastContextMenuAt = 0;
  let selectionTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSelectionHash = '';
  let copiedHash = '';

  function method(): string {
    const now = Date.now();
    if (now - lastCopyKeyAt < 300) return 'keyboard';
    if (now - lastContextMenuAt < 15_000) return 'context_menu';
    return 'other';
  }

  function describeSelection() {
    const sel = document.getSelection();
    const text = sel?.toString() ?? '';
    const node = sel?.anchorNode ?? null;
    const field = fieldOf(node);
    const anchor = closestAnchor(node);
    const pii = isPii(node);
    const fieldText = field ? (field.el.textContent ?? '').trim() : '';
    return {
      text,
      ignored: isIgnored(node),
      props: {
        field: field?.field ?? anchor?.element_id ?? 'unknown',
        element_id: anchor?.element_id ?? null,
        element_key: anchor?.element_key ?? null,
        section: anchor?.section ?? null,
        detected_type: pii ? 'pii' : detectType(text),
        text_length: text.length,
        word_count: text.trim() ? text.trim().split(/\s+/).length : 0,
        is_full_field: !!field && text.trim() === fieldText,
        contains_pii: pii,
        text_hash: hashText(text.trim()),
      },
    };
  }

  function onCopy(e: ClipboardEvent) {
    const d = describeSelection();
    // Copy buttons that fall back to a hidden textarea report themselves via tracker.copied().
    if (d.ignored || isIgnored(document.activeElement) || !d.text.trim()) return;
    copiedHash = d.props.text_hash;
    tracker.memory.lastCopy = { field: d.props.field, detected_type: d.props.detected_type, at: Date.now() };
    tracker.track(EVENTS.ContentCopied.name, { ...d.props, method: method(), action: e.type });
  }

  function onPaste(e: ClipboardEvent) {
    const target = toElement(e.target as Node);
    if (!target || isIgnored(target)) return;
    const text = e.clipboardData?.getData('text') ?? '';
    const field = fieldOf(target)?.field ?? target.getAttribute('name') ?? target.getAttribute('aria-label') ?? target.tagName.toLowerCase();
    tracker.track(EVENTS.ContentPasted.name, {
      field,
      detected_type: detectType(text),
      text_length: text.length,
      element_id: closestAnchor(target)?.element_id ?? null,
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X')) lastCopyKeyAt = Date.now();
  }

  function onSelectionEnd() {
    if (selectionTimer) clearTimeout(selectionTimer);
    // Wait a beat: if the agent copies, the copy event wins and we skip "Text Selected".
    selectionTimer = setTimeout(() => {
      const d = describeSelection();
      const text = d.text.trim();
      if (d.ignored || text.length < 3) return;
      if (d.props.text_hash === lastSelectionHash || d.props.text_hash === copiedHash) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      lastSelectionHash = d.props.text_hash;
      tracker.track(EVENTS.TextSelected.name, {
        field: d.props.field,
        element_id: d.props.element_id,
        section: d.props.section,
        detected_type: d.props.detected_type,
        text_length: d.props.text_length,
        contains_pii: d.props.contains_pii,
      });
    }, 1_500);
  }

  const onContextMenu = () => (lastContextMenuAt = Date.now());

  return {
    name: 'clipboard',
    setup(t) {
      tracker = t;
      document.addEventListener('copy', onCopy, true);
      document.addEventListener('cut', onCopy, true);
      document.addEventListener('paste', onPaste, true);
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('contextmenu', onContextMenu, true);
      document.addEventListener('mouseup', onSelectionEnd, true);
      document.addEventListener('keyup', onSelectionEnd, true);
      return () => {
        document.removeEventListener('copy', onCopy, true);
        document.removeEventListener('cut', onCopy, true);
        document.removeEventListener('paste', onPaste, true);
        document.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('contextmenu', onContextMenu, true);
        document.removeEventListener('mouseup', onSelectionEnd, true);
        document.removeEventListener('keyup', onSelectionEnd, true);
        if (selectionTimer) clearTimeout(selectionTimer);
      };
    },
  };
}
