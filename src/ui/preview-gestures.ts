import { clamp, LIMITS, type Settings } from '../settings';
import { getZoom, setAdjusting } from './artboard';
import { initDrag } from './drag';

const preview = document.getElementById('preview')!;
const scroller = document.getElementById('preview-scroll')!;
const block = document.getElementById('preview-block')!;
const text = document.getElementById('preview-text')!;
const handle = document.getElementById('width-handle')!;
const tip = document.getElementById('gesture-tip')!;

// How far a pixel of pointer movement moves each value.
const TRACKING_PER_PX = 0.001; // em
const LINE_HEIGHT_PER_PX = 0.005;
const SIZE_PER_WHEEL = 0.0015; // exponential: one notch (~100) ≈ 16%

interface GestureOptions {
  settings: Settings;
  /** Called after any gesture changed `settings`; re-renders and syncs the panel. */
  changed: () => void;
  getText: () => string;
  /** Writes text edited inline back to the text input. */
  setText: (value: string) => void;
}

const round = (value: number, step: number) => Math.round(value / step) * step;

function showTip(e: { clientX: number; clientY: number }, label: string): void {
  const box = preview.getBoundingClientRect();
  tip.hidden = false;
  tip.textContent = label;
  tip.style.left = `${e.clientX - box.left + 14}px`;
  tip.style.top = `${e.clientY - box.top + 18}px`;
}

let hideTimer = 0;
function hideTip(delay = 0): void {
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => (tip.hidden = true), delay);
}

export function initPreviewGestures({ settings, changed, getText, setText }: GestureOptions): void {
  const editing = () => text.isContentEditable;

  // Drag the text: horizontal = tracking, vertical = line height.
  let start = { letterSpacing: 0, lineHeight: 0 };
  initDrag(text, {
    enabled: () => !editing(),
    onStart: () => {
      start = { letterSpacing: settings.letterSpacing, lineHeight: settings.lineHeight };
      block.classList.add('dragging');
      setAdjusting(true);
    },
    onMove: ({ dx, dy }, e) => {
      const { letterSpacing: ls, lineHeight: lh } = LIMITS;
      // A value set by hand stops following the size.
      if (dx) settings.autoTracking = false;
      if (dy) settings.autoLineHeight = false;
      settings.letterSpacing = round(
        clamp(start.letterSpacing + dx * TRACKING_PER_PX, ls.min, ls.max),
        0.001,
      );
      settings.lineHeight = round(
        clamp(start.lineHeight + dy * LINE_HEIGHT_PER_PX, lh.min, lh.max),
        0.01,
      );
      changed();
      showTip(
        e,
        `Tracking ${settings.letterSpacing.toFixed(3)}em · Line height ${settings.lineHeight.toFixed(2)}`,
      );
    },
    onEnd: () => {
      block.classList.remove('dragging');
      setAdjusting(false);
      hideTip();
    },
  });

  // Drag the right edge: width. The block is centred, so the edge moves half as fast as the width.
  let startWidth = 0;
  initDrag(handle, {
    threshold: 0,
    onStart: () => {
      startWidth = block.offsetWidth; // artboard px (the artboard is scaled on screen)
      block.classList.add('dragging');
      setAdjusting(true);
    },
    onMove: ({ dx }, e) => {
      const style = getComputedStyle(scroller);
      const room =
        scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const { min, max } = LIMITS.maxWidth;
      settings.maxWidth = Math.round(
        clamp(((startWidth + (2 * dx) / getZoom()) / room) * 100, min, max),
      );
      changed();
      showTip(e, `Width ${settings.maxWidth}%`);
    },
    onEnd: () => {
      block.classList.remove('dragging');
      setAdjusting(false);
      hideTip();
    },
  });

  // Wheel or trackpad pinch over the text: size. A plain wheel still scrolls text that overflows.
  let size = settings.fontSize;
  let wheelTimer = 0;
  block.addEventListener(
    'wheel',
    (e) => {
      const overflowing = scroller.scrollHeight > scroller.clientHeight;
      if (editing() || (overflowing && !e.ctrlKey)) return;
      e.preventDefault();
      if (Math.round(size) !== settings.fontSize) size = settings.fontSize;
      const { min, max } = LIMITS.fontSize;
      size = clamp(size * Math.exp(-e.deltaY * SIZE_PER_WHEEL), min, max);
      settings.fontSize = Math.round(size);
      changed();
      showTip(e, `Size ${settings.fontSize}px`);
      hideTip(700);
      setAdjusting(true);
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => setAdjusting(false), 700);
    },
    { passive: false },
  );

  // Double-click: edit the text in place; Esc or clicking elsewhere ends editing.
  text.addEventListener('dblclick', () => {
    if (editing()) return;
    if (getText() === '') text.textContent = '';
    text.contentEditable = 'plaintext-only';
    block.classList.add('editing');
    text.focus();
  });
  text.addEventListener('input', () => setText(text.innerText.replace(/\n$/, '')));
  const stopEditing = () => {
    if (!editing()) return;
    text.contentEditable = 'false';
    block.classList.remove('editing');
    changed();
  };
  text.addEventListener('blur', stopEditing);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') text.blur();
  });
}
