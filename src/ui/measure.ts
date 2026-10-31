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

/** Squint view: blurs the preview so only the texture of the text block is left. */
export function initSquint(): void {
  const button = document.getElementById('squint')!;
  button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    block.classList.toggle('squint', on);
  });
}
