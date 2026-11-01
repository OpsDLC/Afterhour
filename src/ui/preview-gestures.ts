import { clamp, LIMITS, type Settings } from '../settings';
import { getZoom, setAdjusting } from './artboard';
import { initDrag } from './drag';

const preview = document.getElementById('preview')!;
const scroller = document.getElementById('preview-scroll')!;
const block = document.getElementById('preview-block')!;
const text = document.getElementById('preview-text')!;
const handles = Array.from(block.querySelectorAll<HTMLElement>('.frame-handle'));
const tip = document.getElementById('gesture-tip')!;

// H4N-42 · R1: the canvas only changes geometry (the text frame's width, by its handles).
// Tracking and leading are nudged from the keyboard, as in InDesign, or scrubbed in the panel.
const TRACKING_STEP = 0.005; // em per ⌥←/→
const LEADING_STEP = 0.01; // per ⌥↑/↓
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

  // Click selects the text frame; clicking elsewhere on the canvas or Esc deselects.
  let selected = false;
  const select = (on: boolean) => {
    selected = on;
    block.classList.toggle('selected', on);
  };
  text.addEventListener('pointerdown', () => select(true));
  document.getElementById('pasteboard')!.addEventListener('pointerdown', (e) => {
    if (!block.contains(e.target as Node)) select(false);
  });

  // Frame handles: width. The block is centred, so each side moves half the width change.
  for (const h of handles) {
    const side = Number(h.dataset.side);
    let startWidth = 0;
    initDrag(h, {
      threshold: 0,
      onStart: () => {
        startWidth = block.offsetWidth; // artboard px (the artboard is scaled on screen)
        block.classList.add('dragging');
        select(true);
        setAdjusting(true);
      },
      onMove: ({ dx }, e) => {
        const style = getComputedStyle(scroller);
        const room =
          scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const { min, max } = LIMITS.maxWidth;
        settings.maxWidth = Math.round(
          clamp(((startWidth + (2 * side * dx) / getZoom()) / room) * 100, min, max),
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
  }

  // ⌥←/→ tracking, ⌥↑/↓ leading on the selected text; ⇧ for ×5 (InDesign's keys).
  let nudgeTimer = 0;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected && !editing()) select(false);
    if (!selected || editing() || !e.altKey || e.metaKey || e.ctrlKey) return;
    const dir = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const times = e.shiftKey ? 5 : 1;
    const box = block.getBoundingClientRect();
    const at = { clientX: box.right - 120, clientY: box.bottom - 6 };
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const { min, max } = LIMITS.letterSpacing;
      settings.autoTracking = false; // a value set by hand stops following the size
      settings.letterSpacing = round(
        clamp(settings.letterSpacing + dir * times * TRACKING_STEP, min, max),
        0.001,
      );
      showTip(at, `Tracking ${settings.letterSpacing.toFixed(3)}em`);
    } else {
      const { min, max } = LIMITS.lineHeight;
      settings.autoLineHeight = false;
      settings.lineHeight = round(
        clamp(settings.lineHeight + dir * times * LEADING_STEP, min, max),
        0.01,
      );
      showTip(at, `Line height ${settings.lineHeight.toFixed(2)}`);
    }
    changed();
    hideTip(900);
    setAdjusting(true);
    clearTimeout(nudgeTimer);
    nudgeTimer = window.setTimeout(() => setAdjusting(false), 900);
  });

  // Trackpad pinch (ctrlKey) or ⌘ + wheel over the text: size. A plain wheel only scrolls.
  let size = settings.fontSize;
  let wheelTimer = 0;
  block.addEventListener(
    'wheel',
    (e) => {
      if (editing() || !(e.ctrlKey || e.metaKey)) return;
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
    select(true);
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
