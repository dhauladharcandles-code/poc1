import type { Page } from 'playwright';

/**
 * Behaviour primitives for simulated agents. Real input (mouse, wheel, keyboard) goes through
 * Playwright so the tracker sees trusted events. Long durations (reading, being away, idling)
 * use Playwright's fake clock so a 3-minute investigation takes seconds to simulate.
 */
export class Agent {
  readonly page: Page;
  private readonly speed: number;

  constructor(page: Page, speed = 1) {
    this.page = page;
    this.speed = speed;
  }

  /** Short real pause so the browser can render / IntersectionObserver can fire. */
  async beat(ms = 250) {
    await this.page.waitForTimeout(Math.max(30, ms / this.speed));
  }

  /** Simulated reading time: time passes for the page without real waiting. */
  async read(seconds: number) {
    await this.beat(300);
    await this.page.clock.fastForward(Math.round(seconds * 1000));
    await this.beat(150);
  }

  async moveTo(selector: string, opts: { nth?: number; dx?: number; dy?: number } = {}) {
    if (process.env.SIM_TRACE) console.log('    moveTo', selector, opts.nth ?? 0);
    const pt = await this.point(selector, opts);
    if (pt) await this.page.mouse.move(pt.x, pt.y, { steps: 12 });
  }

  /** A point inside the element's first line box (a wrapped link's bounding-box centre can miss the text). */
  private async point(selector: string, opts: { nth?: number; dx?: number; dy?: number } = {}) {
    const loc = this.page.locator(selector).nth(opts.nth ?? 0);
    await loc.scrollIntoViewIfNeeded();
    return loc.evaluate(
      (el, [dx, dy]) => {
        const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
        return r.width && r.height ? { x: r.left + r.width * dx, y: r.top + r.height * dy } : null;
      },
      [opts.dx ?? 0.5, opts.dy ?? 0.5] as const,
    );
  }

  async hover(selector: string, seconds = 1.2, nth = 0) {
    await this.moveTo(selector, { nth });
    await this.beat(200);
    // Hover-intent timers run on the page clock.
    await this.page.clock.fastForward(Math.round(seconds * 1000));
    await this.beat(100);
  }

  async click(selector: string, opts: { nth?: number; dx?: number; dy?: number } = {}) {
    await this.moveTo(selector, opts);
    await this.beat(120);
    const pt = await this.point(selector, opts);
    if (!pt) return;
    await this.page.mouse.click(pt.x, pt.y);
    await this.beat(250);
  }

  /** Clicks something that isn't clickable a few times in quick succession. */
  async rageClick(selector: string, times = 4) {
    await this.moveTo(selector);
    const box = await this.page.locator(selector).first().boundingBox();
    if (!box) return;
    for (let i = 0; i < times; i++) {
      await this.page.mouse.click(box.x + box.width / 2 + i, box.y + box.height / 2);
      await this.page.waitForTimeout(90);
    }
    await this.page.clock.fastForward(1_000);
    await this.beat(300);
  }

  async wheel(deltaY: number, steps = 6) {
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, deltaY / steps);
      await this.page.waitForTimeout(40);
    }
    await this.beat(250);
  }

  async scrollToBottom() {
    const h = await this.page.evaluate(() => document.documentElement.scrollHeight);
    await this.wheel(h, 14);
  }

  async scrollToTop() {
    await this.wheel(-20_000, 10);
  }

  /** Selects the element's text the way a person would (drag), then optionally copies with Ctrl+C. */
  async selectText(selector: string, nth = 0) {
    if (process.env.SIM_TRACE) console.log('    selectText', selector, nth);
    const loc = this.page.locator(selector).nth(nth);
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    if (!box) return;
    await this.page.mouse.move(box.x + 1, box.y + box.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 8 });
    await this.page.mouse.up();
    await this.beat(150);
  }

  async copyText(selector: string, nth = 0) {
    await this.selectText(selector, nth);
    await this.page.keyboard.press('ControlOrMeta+c');
    await this.beat(200);
    await this.page.evaluate(() => document.getSelection()?.removeAllRanges());
  }

  async findInPage() {
    await this.page.keyboard.press('ControlOrMeta+f');
    await this.beat(200);
  }

  /** Emulates switching to another tab/app. Headless Chromium never hides a page, so visibility is emulated. */
  async leaveTab(seconds: number) {
    await setAttention(this.page, 'hidden');
    await this.page.clock.fastForward(Math.round(seconds * 1000));
    await setAttention(this.page, 'present');
    await this.beat(200);
  }

  /** Tab stays visible but another window has focus (e.g. the helpdesk on a second monitor). */
  async otherWindow(seconds: number) {
    await setAttention(this.page, 'blurred');
    // fastForward fires due timers only at the end of the jump, so let the 1s blur debounce fire first.
    await this.page.clock.fastForward(1_100);
    await this.beat(50);
    await this.page.clock.fastForward(Math.max(0, Math.round(seconds * 1000) - 1_100));
    await setAttention(this.page, 'present');
    await this.beat(200);
  }

  /** No input at all (on a call, reading the screen). */
  async idle(seconds: number) {
    // Two jumps: the first minute without input still counts as engaged (reading), the rest as idle.
    await this.page.clock.fastForward(61_000);
    await this.beat(50);
    await this.page.clock.fastForward(Math.max(0, Math.round(seconds * 1000) - 61_000));
    await this.beat(150);
    await this.page.mouse.move(400 + Math.random() * 200, 300, { steps: 4 });
    await this.beat(150);
  }

  async paste(selector: string, text: string) {
    await this.page.click(selector);
    await this.page.evaluate(
      ({ selector, text }) => {
        const el = document.querySelector(selector) as HTMLInputElement;
        const dt = new DataTransfer();
        dt.setData('text', text);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
      },
      { selector, text },
    );
    await this.page.fill(selector, text);
    await this.beat(800);
  }
}

export async function setAttention(page: Page, state: 'present' | 'hidden' | 'blurred') {
  await page.evaluate((state) => {
    const hidden = state === 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.hasFocus = () => state === 'present';
    if (state === 'present') {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new FocusEvent('focus'));
    } else {
      window.dispatchEvent(new FocusEvent('blur'));
      if (hidden) document.dispatchEvent(new Event('visibilitychange'));
    }
  }, state);
}
