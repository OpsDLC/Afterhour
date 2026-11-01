// Scrubbable values (H4N-42 · B): drag a label or a value left or right to change it, as in
// Photoshop and Figma. Shift = coarse (×10), Alt = fine (×0.1). Kept free of app code (DLC-UI).
export interface ScrubOptions {
  get: () => number;
  /** Receives the raw value; clamp and round there. */
  set: (value: number) => void;
  /** Value change per pixel of horizontal movement. */
  perPx: number;
  onStart?: () => void;
  onEnd?: () => void;
}

export function initScrub(el: HTMLElement, opts: ScrubOptions): void {
  el.classList.add('scrub');
  el.addEventListener('pointerdown', (down) => {
    if (down.button !== 0) return;
    const start = opts.get();
    let dx = 0;
    let lastX = down.clientX;
    let active = false;
    const move = (e: PointerEvent) => {
      const step = e.clientX - lastX;
      lastX = e.clientX;
      if (!active) {
        if (Math.abs(e.clientX - down.clientX) < 3) return;
        active = true;
        el.setPointerCapture(e.pointerId);
        document.body.style.cursor = 'ew-resize';
        opts.onStart?.();
      }
      dx += step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
      opts.set(start + dx * opts.perPx);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      if (active) opts.onEnd?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

/** Double-click a displayed value to type a new one (Enter applies, Esc cancels). */
export function initTypeIn(
  el: HTMLElement,
  opts: { get: () => string; set: (raw: string) => void },
): void {
  el.addEventListener('dblclick', () => {
    const input = document.createElement('input');
    input.className = 'scrub-edit';
    input.value = opts.get();
    el.hidden = true;
    el.after(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (apply: boolean) => {
      if (done) return;
      done = true;
      if (apply) opts.set(input.value);
      input.remove();
      el.hidden = false;
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  });
}
