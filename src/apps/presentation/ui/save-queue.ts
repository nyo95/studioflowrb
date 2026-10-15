import type { ActionResult } from "@platform/core/actions";

type Work = () => Promise<ActionResult<unknown> | undefined>;

/**
 * Saves editor changes one after another in the background (owner 2026-10-15: the screen changes at once, the
 * database follows). Repeated changes of one thing (a slider dragged, a layout tried, a pin nudged) within a short
 * delay are saved once, with the last value. A refusal is reported once; the editor then reloads the server's copy.
 */
export type SaveQueue = {
  /** A quiet save, coalesced by `key`: a newer change of the same thing replaces one that has not started yet. */
  later: (key: string, work: Work, delay?: number) => void;
  /** Queued now (after anything already waiting); `heavy` marks work the screen waits for (uploads, new ids). */
  run: (work: Work, options: { heavy?: boolean; after?: (data: unknown) => void }) => void;
  /** Starts every delayed save now (leaving the editor). */
  flush: () => void;
  setFail: (onFail: (message: string) => void) => void;
};

export function createSaveQueue(options: { onChange: (waiting: number, heavy: number) => void; onFail: (message: string) => void }): SaveQueue {
  const delayed = new Map<string, { timer: ReturnType<typeof setTimeout>; work: Work }>();
  let chain: Promise<void> = Promise.resolve();
  let queued = 0;
  let heavy = 0;
  let onFail = options.onFail;
  const report = () => options.onChange(delayed.size + queued, heavy);

  const enqueue = (work: Work, isHeavy: boolean, after?: (data: unknown) => void) => {
    queued += 1;
    if (isHeavy) heavy += 1;
    report();
    chain = chain.then(async () => {
      try {
        const result = await work();
        if (result && !result.ok) onFail(result.error.safeMessage);
        else if (result) after?.(result.data);
      } catch {
        onFail("The change could not be saved. Please try again.");
      } finally {
        queued -= 1;
        if (isHeavy) heavy -= 1;
        report();
      }
    });
  };
  const start = (key: string) => {
    const entry = delayed.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    delayed.delete(key);
    enqueue(entry.work, false);
  };

  return {
    later(key, work, delay = 0) {
      const existing = delayed.get(key);
      if (existing) clearTimeout(existing.timer);
      delayed.set(key, { work, timer: setTimeout(() => start(key), delay) });
      report();
    },
    run(work, runOptions) {
      // Anything delayed goes first, so the server sees changes in the order they were made.
      for (const key of [...delayed.keys()]) start(key);
      enqueue(work, runOptions.heavy ?? false, runOptions.after);
    },
    flush() {
      for (const key of [...delayed.keys()]) start(key);
    },
    setFail(next) {
      onFail = next;
    },
  };
}
