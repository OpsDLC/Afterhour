import { getFontState } from '../fonts/state';
import type { Settings } from '../settings';
import { charsPerLine, COMFORTABLE_MEASURE } from '../type-rules';

const block = document.getElementById('preview-block')!;
const out = document.getElementById('measure')!;
const ctx = document.createElement('canvas').getContext('2d')!;
// An English pangram gives a typical mix of narrow and wide letters.
const SAMPLE = 'The quick brown fox jumps over the lazy dog';

/** Shows how many characters fit on a line at the current settings. */
export function updateMeasure(settings: Settings): void {
  const { family } = getFontState().current;
  ctx.font = `${settings.fontWeight} ${settings.fontSize}px "${family}"`;
  const advance =
    ctx.measureText(SAMPLE).width / SAMPLE.length + settings.letterSpacing * settings.fontSize;
  const chars = charsPerLine(block.clientWidth, advance);
  const { min, max } = COMFORTABLE_MEASURE;
  const comfortable = chars >= min && chars <= max;
  out.textContent = `≈ ${chars} characters per line${comfortable ? '' : ` · comfortable: ${min}–${max}`}`;
  out.classList.toggle('off-measure', !comfortable);
}

/**
 * Blur view: blurs the preview so only the texture of the text block is left. The corner
 * button toggles it; holding B shows it until the key is released.
 */
export function initBlurView(): void {
  const button = document.getElementById('blur-view')!;
  let pinned = false;
  const show = (on: boolean) => {
    button.setAttribute('aria-pressed', String(on));
    block.classList.toggle('blurred', on);
  };
  button.addEventListener('click', () => show((pinned = !pinned)));

  const typing = (el: EventTarget | null) =>
    el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName));
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'b' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing(e.target)) return;
    show(true);
  });
  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'b') show(pinned);
  });
  window.addEventListener('blur', () => show(pinned));
}
