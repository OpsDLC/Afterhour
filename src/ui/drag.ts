// Pointer dragging with the modifiers design tools use: Shift for fine steps, Alt to lock to
// the dominant axis. Movement starts only past a small threshold so clicks and double-clicks
// still reach the element. Kept free of app-specific code so it can move to DLC-UI.
export interface DragOptions {
  /** Pixels the pointer must travel before the drag starts. */
  threshold?: number;
  /** Multiplier applied to movement while Shift is held. */
  fine?: number;
  /** Return false to ignore a pointerdown (e.g. while editing). */
  enabled?: (e: PointerEvent) => boolean;
  onStart?: (e: PointerEvent) => void;
  /** Total movement since the drag started, after Shift/Alt are applied. */
  onMove: (delta: { dx: number; dy: number }, e: PointerEvent) => void;
  onEnd?: (e: PointerEvent) => void;
}

export function initDrag(el: HTMLElement, opts: DragOptions): void {
  const threshold = opts.threshold ?? 3;
  const fine = opts.fine ?? 0.2;

  el.addEventListener('pointerdown', (down) => {
    if (down.button !== 0 || opts.enabled?.(down) === false) return;
    let lastX = down.clientX;
    let lastY = down.clientY;
    let dx = 0;
    let dy = 0;
    let dragging = false;

    const move = (e: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < threshold) return;
        dragging = true;
        el.setPointerCapture(e.pointerId);
        opts.onStart?.(e);
      }
      const scale = e.shiftKey ? fine : 1;
      dx += (e.clientX - lastX) * scale;
      dy += (e.clientY - lastY) * scale;
      lastX = e.clientX;
      lastY = e.clientY;
      const locked = e.altKey
        ? Math.abs(dx) >= Math.abs(dy)
          ? { dx, dy: 0 }
          : { dx: 0, dy }
        : { dx, dy };
      opts.onMove(locked, e);
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragging) opts.onEnd?.(e);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}
