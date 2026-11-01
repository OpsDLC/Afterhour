// Undo / redo for settings (H4N-42). Pure: no DOM, so it is tested in node.
// Changes that follow each other quickly (a drag, a slider sweep, wheel steps) are one step.

export interface History<T> {
  /** Call after every change; `now` in ms (defaults to Date.now()). */
  record(state: T, now?: number): void;
  undo(): T | null;
  redo(): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
}

export function createHistory<T>(
  initial: T,
  opts: { groupMs?: number; limit?: number } = {},
): History<T> {
  const groupMs = opts.groupMs ?? 500;
  const limit = opts.limit ?? 200;
  const key = (s: T) => JSON.stringify(s);
  const clone = (s: T): T => JSON.parse(JSON.stringify(s));
  const past: T[] = [];
  const future: T[] = [];
  let current = clone(initial);
  let lastAt = -Infinity;

  return {
    record(state, now = Date.now()) {
      if (key(state) === key(current)) return;
      // a change soon after the previous one continues the same step
      if (now - lastAt > groupMs || !past.length) {
        past.push(current);
        if (past.length > limit) past.shift();
      }
      current = clone(state);
      future.length = 0;
      lastAt = now;
    },
    undo() {
      const prev = past.pop();
      if (!prev) return null;
      future.push(current);
      current = prev;
      lastAt = -Infinity;
      return clone(prev);
    },
    redo() {
      const next = future.pop();
      if (!next) return null;
      past.push(current);
      current = next;
      lastAt = -Infinity;
      return clone(next);
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
