import { clamp, LIMITS, type Settings } from '../settings';

// The artboard is the pane: a real pixel size, scaled to fit the window, with print crop marks
// and optional rulers (H4N-38: B crop marks + C rulers, rulers toggled with ⌘R / Ctrl+R).

const pasteboard = document.getElementById('pasteboard')!;
const frame = document.getElementById('artboard-frame')!;
const board = document.getElementById('artboard')!;
const label = document.getElementById('artboard-label')!;
const rulerX = document.getElementById('ruler-x') as HTMLCanvasElement;
const rulerY = document.getElementById('ruler-y') as HTMLCanvasElement;
const rulersButton = document.getElementById('rulers-toggle')!;
const inputW = document.getElementById('artboard-w') as HTMLInputElement;
const inputH = document.getElementById('artboard-h') as HTMLInputElement;

/** Space kept around the artboard, in screen px: crop marks + label below + the hint line. */
const MARGIN = { top: 64, right: 64, bottom: 88, left: 64 };
const RULER = 20; // ruler thickness
const RULER_GAP = 30; // between ruler and artboard edge: clears the crop marks (8 + 18 px)
const STORE_KEY = 'afterhour.rulers';

let zoom = 1;
let rulersOn = false;
let pointer: { x: number; y: number } | null = null; // in artboard px, for the ruler markers
let current = { w: 0, h: 0 };

/** Screen px per artboard px. */
export const getZoom = () => zoom;

const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function layout(): void {
  const { w, h } = current;
  if (!w) return;
  const extra = rulersOn ? RULER + RULER_GAP : 0;
  const availW = pasteboard.clientWidth - MARGIN.left - MARGIN.right - extra;
  const availH = pasteboard.clientHeight - MARGIN.top - MARGIN.bottom - extra;
  zoom = Math.max(0.05, Math.min(1, availW / w, availH / h));
  const sw = w * zoom,
    sh = h * zoom;
  // centre in the space left after the rulers
  const left = Math.round(MARGIN.left + extra + (availW - sw) / 2);
  const top = Math.round(MARGIN.top + extra + (availH - sh) / 2);
  Object.assign(frame.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${sw}px`,
    height: `${sh}px`,
  });
  Object.assign(board.style, { width: `${w}px`, height: `${h}px`, transform: `scale(${zoom})` });
  label.textContent = `${w} × ${h} px  ·  ${Math.round(zoom * 100)}%`;
  drawRulers();
}

/** Major tick spacing in artboard px so that majors sit ≥ ~64 screen px apart. */
function tickStep(): { major: number; minor: number } {
  for (const major of [10, 20, 50, 100, 200, 500, 1000, 2000]) {
    if (major * zoom >= 64) return { major, minor: major * zoom >= 120 ? major / 10 : major / 5 };
  }
  return { major: 5000, minor: 1000 };
}

function drawRuler(canvas: HTMLCanvasElement, horizontal: boolean): void {
  const { w, h } = current;
  const box = frame.getBoundingClientRect(),
    pb = pasteboard.getBoundingClientRect();
  const len = (horizontal ? w : h) * zoom;
  const dpr = window.devicePixelRatio || 1;
  const cw = horizontal ? len + 1 : RULER,
    ch = horizontal ? RULER : len + 1;
  canvas.style.left = `${horizontal ? box.left - pb.left : box.left - pb.left - RULER_GAP - RULER}px`;
  canvas.style.top = `${horizontal ? box.top - pb.top - RULER_GAP - RULER : box.top - pb.top}px`;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.width = Math.ceil(cw * dpr);
  canvas.height = Math.ceil(ch * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const { major, minor } = tickStep();
  const ink = css('--dim') || '#777';
  ctx.fillStyle = ink;
  ctx.font = `9px ${css('--ui-font') || 'sans-serif'}`;
  ctx.textBaseline = 'top';
  const total = horizontal ? w : h;
  for (let v = 0; v <= total + 0.001; v += minor) {
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const p = Math.round(v * zoom) + 0.5;
    const t = isMajor ? 8 : 4; // tick length, from the edge facing the artboard
    if (horizontal) ctx.fillRect(p - 0.5, RULER - t, 1, t);
    else ctx.fillRect(RULER - t, p - 0.5, t, 1);
    if (isMajor && v < total - minor / 2) {
      const text = String(Math.round(v));
      if (horizontal) ctx.fillText(text, p + 3, 2);
      else {
        ctx.save();
        ctx.translate(2, p + 3);
        ctx.rotate(Math.PI / 2);
        ctx.translate(0, -9);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
  }
  // where the pointer is, in Klein blue
  if (pointer) {
    const v = horizontal ? pointer.x : pointer.y;
    if (v >= 0 && v <= total) {
      ctx.fillStyle = css('--accent') || '#002fa7';
      const p = Math.round(v * zoom);
      if (horizontal) ctx.fillRect(p, 0, 1, RULER);
      else ctx.fillRect(0, p, RULER, 1);
    }
  }
}

function drawRulers(): void {
  rulerX.hidden = rulerY.hidden = !rulersOn;
  if (!rulersOn) return;
  drawRuler(rulerX, true);
  drawRuler(rulerY, false);
}

function setRulers(on: boolean): void {
  rulersOn = on;
  rulersButton.setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem(STORE_KEY, on ? '1' : '0');
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
  layout();
}

/** Wires the artboard to `settings`. Returns a function that syncs it after settings change. */
export function initArtboard(settings: Settings, changed: () => void): () => void {
  const sync = () => {
    current = { w: settings.artboardWidth, h: settings.artboardHeight };
    if (document.activeElement !== inputW) inputW.value = String(current.w);
    if (document.activeElement !== inputH) inputH.value = String(current.h);
    layout();
  };

  const { min, max } = LIMITS.artboard;
  for (const [input, key] of [
    [inputW, 'artboardWidth'],
    [inputH, 'artboardHeight'],
  ] as const) {
    input.addEventListener('change', () => {
      const v = Number(input.value);
      settings[key] = Number.isFinite(v) && v > 0 ? Math.round(clamp(v, min, max)) : settings[key];
      input.value = String(settings[key]);
      changed();
    });
  }

  let stored: boolean;
  try {
    stored = localStorage.getItem(STORE_KEY) === '1';
  } catch {
    stored = false;
  }
  rulersOn = stored;
  rulersButton.setAttribute('aria-pressed', String(stored));
  rulersButton.addEventListener('click', () => setRulers(!rulersOn));
  // ⌘R / Ctrl+R: Illustrator's shortcut (stops the browser reload while Afterhour has focus)
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'r' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setRulers(!rulersOn);
  });

  pasteboard.addEventListener('pointermove', (e) => {
    if (!rulersOn) return;
    const box = frame.getBoundingClientRect();
    pointer = { x: (e.clientX - box.left) / zoom, y: (e.clientY - box.top) / zoom };
    drawRulers();
  });
  pasteboard.addEventListener('pointerleave', () => {
    pointer = null;
    drawRulers();
  });

  new ResizeObserver(layout).observe(pasteboard);
  sync();
  return sync;
}
