import { clamp, LIMITS, type Settings } from '../settings';

// The artboard is the pane: a real pixel size, scaled to fit the window, with print crop marks
// and optional rulers (H4N-38: B crop marks + C rulers, rulers toggled with ⌘R / Ctrl+R).
// H4N-41 (B · fuse): the rulers live in the crop-mark gutter. The crop marks are the rulers' 0 and
// end ticks; ticks grow from the marks' inner end outward, numbers sit at their outer end, and
// turning the rulers on never moves or resizes the artboard.

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
// Must match .crop in style.css: marks start 8 px off the edge and are 18 px long.
const CROP_GAP = 8;
const CROP_LEN = 18;
const BAND = CROP_GAP + CROP_LEN; // the gutter the rulers occupy
const STORE_KEY = 'afterhour.rulers';

let zoom = 1;
let rulersOn = false;
let pointer: { x: number; y: number } | null = null; // in artboard px, for the ruler markers
let current = { w: 0, h: 0 };
let extra = '';

/** Extra facts for the label under the artboard (e.g. seed and rain amount while it rains). */
export function setLabelExtra(text: string): void {
  extra = text;
  layout();
}

/** Screen px per artboard px. */
export const getZoom = () => zoom;

const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function layout(): void {
  const { w, h } = current;
  if (!w) return;
  const availW = pasteboard.clientWidth - MARGIN.left - MARGIN.right;
  const availH = pasteboard.clientHeight - MARGIN.top - MARGIN.bottom;
  zoom = Math.max(0.05, Math.min(1, availW / w, availH / h));
  const sw = w * zoom,
    sh = h * zoom;
  const left = Math.round(MARGIN.left + (availW - sw) / 2);
  const top = Math.round(MARGIN.top + (availH - sh) / 2);
  Object.assign(frame.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${sw}px`,
    height: `${sh}px`,
  });
  Object.assign(board.style, { width: `${w}px`, height: `${h}px`, transform: `scale(${zoom})` });
  label.textContent = `${w} × ${h} px  ·  ${Math.round(zoom * 100)}%${extra ? `  ·  ${extra}` : ''}`;
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
  // the canvas covers the gutter along the top (or left) edge; its inner side is the crop marks' inner end
  const cw = horizontal ? len + 1 : CROP_LEN + 2,
    ch = horizontal ? CROP_LEN + 2 : len + 1;
  canvas.style.left = `${horizontal ? box.left - pb.left : box.left - pb.left - BAND - 2}px`;
  canvas.style.top = `${horizontal ? box.top - pb.top - BAND - 2 : box.top - pb.top}px`;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.width = Math.ceil(cw * dpr);
  canvas.height = Math.ceil(ch * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const { major, minor } = tickStep();
  const text = css('--text') || '#000';
  const inner = horizontal ? ch : cw; // where the ticks start (the crop marks' inner end)
  ctx.font = `9px ${css('--ui-font') || 'sans-serif'}`;
  ctx.textBaseline = 'top';
  const total = horizontal ? w : h;
  for (let v = minor; v < total - minor / 2; v += minor) {
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const p = Math.round(v * zoom);
    const t = isMajor ? 7 : 3;
    ctx.globalAlpha = isMajor ? 0.75 : 0.4;
    ctx.fillStyle = text;
    if (horizontal) ctx.fillRect(p, inner - t, 1, t);
    else ctx.fillRect(inner - t, p, t, 1);
    if (isMajor && v < total - major / 2) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = css('--dim') || '#777';
      const label = String(Math.round(v));
      if (horizontal) ctx.fillText(label, p + 3, 1);
      else {
        ctx.save();
        ctx.translate(1, p - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
  }
  ctx.globalAlpha = 1;
  // where the pointer is, in Klein blue, the full height of a crop mark
  if (pointer) {
    const v = horizontal ? pointer.x : pointer.y;
    if (v >= 0 && v <= total) {
      ctx.fillStyle = css('--accent') || '#002fa7';
      const p = Math.round(v * zoom);
      if (horizontal) ctx.fillRect(p, inner - CROP_LEN, 1, CROP_LEN);
      else ctx.fillRect(inner - CROP_LEN, p, CROP_LEN, 1);
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
