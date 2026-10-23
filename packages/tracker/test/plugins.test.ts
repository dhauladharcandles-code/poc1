import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attentionPlugin } from '../src/plugins/attention';
import { clicksPlugin } from '../src/plugins/clicks';
import { clipboardPlugin } from '../src/plugins/clipboard';
import { keyboardPlugin } from '../src/plugins/misc';
import { viewabilityPlugin } from '../src/plugins/viewability';
import { setFocus, setup, setVisibility } from './helpers';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
  vi.useFakeTimers();
  setVisibility('visible');
  document.hasFocus = () => true;
});
afterEach(() => vi.useRealTimers());

describe('attention', () => {
  it('reports leaving after a copy and how long the agent was away', () => {
    const { tracker, named } = setup([attentionPlugin()]);
    tracker.page('order_detail');
    tracker.copied('1Z999AA10123456784', 'tracking_number');
    vi.advanceTimersByTime(2_000);
    setVisibility('hidden');
    expect(named('Page Left')[0].props).toMatchObject({ leave_type: 'tab_hidden', last_action: 'Content Copied', last_copy_field: 'tracking_number' });
    vi.advanceTimersByTime(45_000);
    setVisibility('visible');
    expect(named('Page Returned')[0].props).toMatchObject({ away_type: 'tab_hidden', away_ms: 45_000, left_after_copy: true });
  });

  it('debounces window blur and ignores short ones', () => {
    const { tracker, named } = setup([attentionPlugin()]);
    tracker.page('order_detail');
    setFocus(false);
    vi.advanceTimersByTime(500);
    setFocus(true);
    expect(named('Page Left')).toHaveLength(0);

    setFocus(false);
    vi.advanceTimersByTime(1_200);
    expect(named('Page Left')[0].props.leave_type).toBe('window_blur');
    vi.advanceTimersByTime(20_000);
    setFocus(true);
    expect(named('Page Returned')[0].props.away_ms).toBeGreaterThanOrEqual(20_000);
  });

  it('splits time into engaged, hidden and idle', () => {
    const { tracker, named } = setup([attentionPlugin({ idleMs: 60_000 })]);
    tracker.page('order_detail');
    document.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(10_000); // engaged
    setVisibility('hidden'); // flushes
    vi.advanceTimersByTime(30_000);
    setVisibility('visible');
    vi.advanceTimersByTime(90_000); // 60s still "engaged" (reading), then idle
    expect(named('Agent Idle')).toHaveLength(1);
    document.dispatchEvent(new Event('keydown'));
    expect(named('Agent Active')[0].props.idle_ms).toBeGreaterThanOrEqual(90_000);
    tracker.flush('manual');
    const sum = (k: string) => named('Engagement Time Recorded').reduce((s, e) => s + Number(e.props[k] ?? 0), 0);
    expect(sum('hidden_ms')).toBe(30_000);
    expect(sum('engaged_ms')).toBeGreaterThanOrEqual(69_000);
    expect(sum('engaged_ms')).toBeLessThanOrEqual(71_000);
    expect(sum('idle_ms')).toBeGreaterThanOrEqual(29_000);
  });
});

describe('clicks', () => {
  function el(html: string) {
    document.body.innerHTML = html;
    return document.body.firstElementChild as HTMLElement;
  }

  it('anchors clicks to the nearest tracked element', () => {
    const root = el('<div data-track-id="line_item.shipment" data-track-key="li_1" data-track-section="line_items"><button>Track</button></div>');
    root.getBoundingClientRect = () => ({ left: 100, top: 200, width: 200, height: 100, right: 300, bottom: 300, x: 100, y: 200, toJSON: () => ({}) });
    const { tracker, named } = setup([clicksPlugin()]);
    tracker.page('order_detail');
    root.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 150, clientY: 275 }));
    expect(named('Element Clicked')[0].props).toMatchObject({
      element_id: 'line_item.shipment',
      element_key: 'li_1',
      section: 'line_items',
      x_rel: 0.25,
      y_rel: 0.75,
      is_interactive: true,
      target_tag: 'button',
    });
  });

  it('detects rage clicks', () => {
    el('<div data-track-id="line_item.tracking_number"><span>1Z999</span></div>');
    const { tracker, named } = setup([clicksPlugin()]);
    tracker.page('order_detail');
    const span = document.querySelector('span')!;
    for (let i = 0; i < 4; i++) {
      span.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10 + i, clientY: 10 }));
      vi.advanceTimersByTime(100);
    }
    expect(named('Rage Click Detected')).toHaveLength(1);
    expect(named('Rage Click Detected')[0].props).toMatchObject({ element_id: 'line_item.tracking_number', is_interactive: false });
  });

  it('flags a click on non-interactive text that changes nothing as a dead click — but not a drag-select', async () => {
    el('<div data-track-id="line_item.tracking_number"><span>1Z999</span></div>');
    const { tracker, named } = setup([clicksPlugin()]);
    tracker.page('order_detail');
    const span = document.querySelector('span')!;
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10, detail: 1 }));
    await vi.advanceTimersByTimeAsync(800);
    expect(named('Dead Click Detected')[0].props).toMatchObject({ kind: 'non_interactive', element_id: 'line_item.tracking_number' });

    span.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 10 }));
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 10, detail: 1 }));
    await vi.advanceTimersByTimeAsync(800);
    expect(named('Dead Click Detected')).toHaveLength(1);
  });

  it('does not flag a click that changed the page', async () => {
    el('<div data-track-id="x"><button>Open</button><div id="out"></div></div>');
    const btn = document.querySelector('button')!;
    btn.addEventListener('click', () => (document.getElementById('out')!.textContent = 'opened'));
    const { tracker, named } = setup([clicksPlugin()]);
    tracker.page('order_detail');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await vi.advanceTimersByTimeAsync(800);
    expect(named('Dead Click Detected')).toHaveLength(0);
  });
});

describe('clipboard & keyboard', () => {
  it('describes what was copied without sending it', () => {
    document.body.innerHTML = '<div data-track-id="line_item.shipment"><span data-track-field="tracking_number">1Z999AA10123456784</span></div>';
    const { tracker, named } = setup([clipboardPlugin()]);
    tracker.page('order_detail');
    const span = document.querySelector('span')!;
    const range = document.createRange();
    range.selectNodeContents(span);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));
    document.dispatchEvent(new Event('copy'));
    const e = named('Content Copied')[0].props;
    expect(e).toMatchObject({ field: 'tracking_number', method: 'keyboard', detected_type: 'tracking_number', is_full_field: true, contains_pii: false });
    expect(JSON.stringify(e)).not.toContain('1Z999AA10123456784');
  });

  it('never classifies PII beyond "pii"', () => {
    document.body.innerHTML = '<address data-pii data-track-field="shipping_address">4417 Cedar Hollow Rd</address>';
    const { tracker, named } = setup([clipboardPlugin()]);
    tracker.page('order_detail');
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('address')!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('copy'));
    expect(named('Content Copied')[0].props).toMatchObject({ field: 'shipping_address', detected_type: 'pii', contains_pii: true });
  });

  it('detects find-in-page', () => {
    const { tracker, named } = setup([keyboardPlugin()]);
    tracker.page('order_detail');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true }));
    expect(named('Find In Page Used')).toHaveLength(1);
  });
});

describe('viewability', () => {
  type Cb = (entries: Partial<IntersectionObserverEntry>[]) => void;
  let fire: Cb;

  beforeEach(() => {
    class FakeIO {
      constructor(cb: Cb) {
        fire = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);
  });

  it('emits Element Viewed after ≥50% for ≥1s and reports dwell, pausing while hidden', () => {
    document.body.innerHTML = '<section data-track-id="address_card" data-track-section="address"></section>';
    const target = document.querySelector('section')!;
    const { tracker, named } = setup([viewabilityPlugin()]);
    tracker.page('order_detail');
    const rect = { height: 200 } as DOMRectReadOnly;
    fire([{ target, isIntersecting: true, intersectionRatio: 0.3, intersectionRect: rect }]);
    vi.advanceTimersByTime(2_000);
    expect(named('Element Viewed')).toHaveLength(0);

    fire([{ target, isIntersecting: true, intersectionRatio: 0.8, intersectionRect: rect }]);
    vi.advanceTimersByTime(1_100);
    expect(named('Element Viewed')[0].props).toMatchObject({ element_id: 'address_card', section: 'address' });

    vi.advanceTimersByTime(3_900); // 5s visible so far
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000); // must not count
    setVisibility('visible');
    vi.advanceTimersByTime(1_000);
    tracker.flush('manual');
    const rows = named('Element Exposure Recorded')[0].props.elements as { element_id: string; visible_ms: number }[];
    const row = rows.find((r) => r.element_id === 'address_card')!;
    expect(row.visible_ms).toBeGreaterThanOrEqual(5_900);
    expect(row.visible_ms).toBeLessThanOrEqual(6_100);
  });
});
