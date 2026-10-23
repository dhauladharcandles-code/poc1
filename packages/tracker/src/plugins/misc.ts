import { EVENTS } from '../tracking-plan';
import { docHeight } from '../dom';
import type { Plugin } from '../types';

/** Ctrl/Cmd+F and print — both say "the page didn't give me what I needed the normal way". */
export function keyboardPlugin(): Plugin {
  return {
    name: 'keyboard',
    setup(tracker) {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
          tracker.track(EVENTS.FindInPageUsed.name, {
            scroll_pct: Math.round(((window.scrollY + window.innerHeight) / docHeight()) * 100),
          });
        }
      };
      const onPrint = () => tracker.track(EVENTS.PagePrinted.name, {});
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('beforeprint', onPrint);
      return () => {
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('beforeprint', onPrint);
      };
    },
  };
}

export function errorsPlugin(): Plugin {
  return {
    name: 'errors',
    setup(tracker) {
      let count = 0;
      const report = (kind: string, message: string, source?: string) => {
        // A broken render loop shouldn't flood the pipeline.
        if (++count > 25) return;
        tracker.track(EVENTS.ErrorEncountered.name, { kind, message: message.slice(0, 300), source: source ?? null });
      };
      const onError = (e: ErrorEvent) => report('js', e.message, e.filename ? `${e.filename}:${e.lineno}` : undefined);
      const onRejection = (e: PromiseRejectionEvent) => report('promise', String((e.reason as Error)?.message ?? e.reason));
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);
      return () => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
      };
    },
  };
}
