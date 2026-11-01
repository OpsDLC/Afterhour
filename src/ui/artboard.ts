import { clamp, LIMITS, type Settings } from '../settings';
import { subscribe } from '../fonts/state';
import { measureType, type TypeMarks } from './type-marks';

// The artboard is the pane: a real pixel size, scaled to fit the window, with print crop marks
// and optional rulers (H4N-38: B crop marks + C rulers, rulers toggled with ⌘R / Ctrl+R).
// H4N-41 (B · fuse): the rulers live in the crop-mark gutter. The crop marks are the rulers' 0 and
// end ticks; ticks grow from the marks' inner end outward, numbers sit at their outer end, and
// turning the rulers on never moves or resizes the artboard.
// The rulers mark the type, not the pointer (Yunhan: engineering beauty, every mark informs):
// ink left/right and the measure on X, each baseline on Y, cap and x-height of the first line
// as faint ticks. While a gesture changes the type, dashed guides run from those marks across
// the artboard (blue: interaction only).

const pasteboard = document.getElementById('pasteboard')!;
const frame = document.getElementById('artboard-frame')!;
const board = document.getElementById('artboard')!;
const label = document.getElementById('artboard-label')!;
const text = document.getElementById('preview-text')!;
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
const TOP_EXTRA = 14; // above the top ruler: room for the measure readout
const LEFT_EXTRA = 14; // left of the left ruler: room for four-digit baseline readouts
const STORE_KEY = 'afterhour.rulers';

let zoom = 1;
let rulersOn = false;
let marks: TypeMarks | null = null;
let adjusting = false;
let settingsRef: Settings | null = null;
let current = { w: 0, h: 0 };
let extra = '';

/** Extra facts for the label under the artboard (e.g. seed and rain amount while it rains). */
export function setLabelExtra(text: string): void {
  extra = text;
  layout();
}

const guides = document.createElement('div');
guides.className = 'type-guides';
guides.setAttribute('aria-hidden', 'true');
pasteboard.appendChild(guides);

/** Re-measures the type and redraws the rulers (call after the text or its settings change). */
export function refreshRulers(): void {
  if (rulersOn) drawRulers();
}

/** True while a gesture is changing the type: shows guides across the artboard. */
export function setAdjusting(on: boolean): void {
  if (on === adjusting) return;
  adjusting = on;
  drawGuides();
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
  board.style.setProperty('--inv-zoom', String(1 / zoom));
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
  // the canvas covers the gutter along the top (or left) edge; its inner side is the crop marks'
  // inner end, and it reaches a little further out for the readouts
  const depth = CROP_LEN + 2 + (horizontal ? TOP_EXTRA : LEFT_EXTRA);
  const cw = horizontal ? len + 40 : depth,
    ch = horizontal ? depth : len + 1;
  canvas.style.left = `${horizontal ? box.left - pb.left : box.left - pb.left - BAND - 2 - LEFT_EXTRA}px`;
  canvas.style.top = `${horizontal ? box.top - pb.top - BAND - 2 - TOP_EXTRA : box.top - pb.top}px`;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.width = Math.ceil(cw * dpr);
  canvas.height = Math.ceil(ch * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const { major, minor } = tickStep();
  const ink = css('--text') || '#000';
  const dim = css('--dim') || '#777';
  const font = css('--ui-font') || 'sans-serif';
  const inner = horizontal ? ch : cw; // where the ticks start (the crop marks' inner end)
  const total = horizontal ? w : h;
  const at = (v: number) => Math.round(v * zoom);

  // what the type gives: these marks win over the plain scale
  const strong: number[] = [];
  const faint: number[] = [];
  if (marks) {
    if (horizontal) strong.push(marks.left, marks.right);
    else {
      strong.push(...marks.baselines);
      faint.push(marks.capHeight, marks.xHeight);
    }
  }
  const near = (p: number, gap: number) => strong.some((v) => Math.abs(at(v) - p) < gap);

  // the plain scale, quiet
  ctx.font = `9px ${font}`;
  ctx.textBaseline = 'top';
  for (let v = minor; v < total - minor / 2; v += minor) {
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const p = at(v);
    const t = isMajor ? 7 : 3;
    ctx.globalAlpha = isMajor ? 0.35 : 0.2;
    ctx.fillStyle = ink;
    if (horizontal) ctx.fillRect(p, inner - t, 1, t);
    else ctx.fillRect(inner - t, p, t, 1);
    if (isMajor && v < total - major / 2 && !near(p, horizontal ? 34 : 30)) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = dim;
      const label = String(Math.round(v));
      if (horizontal) ctx.fillText(label, p + 3, TOP_EXTRA + 1);
      else {
        ctx.save();
        ctx.translate(LEFT_EXTRA + 1, p - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
  }

  // the type's marks: full crop-mark length, black, with their value
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  ctx.font = `10px ${font}`;
  for (const v of strong) {
    if (v < 0 || v > total) continue;
    const p = at(v);
    if (horizontal) {
      ctx.fillRect(p, inner - CROP_LEN, 1, CROP_LEN);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.round(v)), p + 3, TOP_EXTRA);
    } else {
      ctx.fillRect(inner - CROP_LEN, p, CROP_LEN, 1);
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(v)), inner - 1, p - 1);
    }
  }
  ctx.globalAlpha = 0.5;
  for (const v of faint) {
    if (v < 0 || v > total) continue;
    if (!horizontal) ctx.fillRect(inner - 10, at(v), 10, 1);
  }
  ctx.globalAlpha = 1;
  if (horizontal && marks) {
    ctx.fillStyle = dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `10px ${font}`;
    ctx.fillText(
      `measure ${Math.round(marks.right - marks.left)}`,
      (at(marks.left) + at(marks.right)) / 2,
      0,
    );
  }
  ctx.textAlign = 'left';
}

/** Dashed guides from the marks across the artboard, only while the type is being adjusted. */
function drawGuides(): void {
  const show = rulersOn && adjusting && marks;
  guides.hidden = !show;
  if (!show || !marks) return;
  const box = frame.getBoundingClientRect(),
    pb = pasteboard.getBoundingClientRect();
  const x0 = box.left - pb.left,
    y0 = box.top - pb.top;
  const parts: string[] = [];
  for (const v of [marks.left, marks.right])
    parts.push(
      `<i class="guide-v" style="left:${x0 + v * zoom}px;top:${y0}px;height:${box.height}px"></i>`,
    );
  for (const v of marks.baselines)
    parts.push(
      `<i class="guide-h" style="top:${y0 + v * zoom}px;left:${x0}px;width:${box.width}px"></i>`,
    );
  guides.innerHTML = parts.join('');
}

function drawRulers(): void {
  rulerX.hidden = rulerY.hidden = !rulersOn;
  if (rulersOn && settingsRef) marks = measureType(text, board, zoom, settingsRef);
  if (rulersOn) {
    drawRuler(rulerX, true);
    drawRuler(rulerY, false);
  }
  drawGuides();
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
  settingsRef = settings;
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

  // the type moves when a font finishes loading
  subscribe(() => requestAnimationFrame(refreshRulers));
  void document.fonts.ready.then(refreshRulers);
  document.fonts.addEventListener('loadingdone', () => refreshRulers());

  new ResizeObserver(layout).observe(pasteboard);
  sync();
  return sync;
}
