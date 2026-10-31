import { getFontState } from './fonts/state';
import type { Settings } from './settings';

const out = document.getElementById('preview-text')!;

// The only code that writes to the preview. A canvas renderer can replace it later.
export function render(text: string, settings: Settings): void {
  const empty = text.length === 0;
  out.textContent = empty ? 'Type something…' : text;
  out.classList.toggle('is-empty', empty);
  out.style.fontWeight = String(settings.fontWeight);
  out.style.fontSize = `${settings.fontSize}px`;
  out.style.letterSpacing = `${settings.letterSpacing}em`;
  out.style.lineHeight = String(settings.lineHeight);
  out.style.textAlign = settings.align;
  out.style.width = `${settings.maxWidth}%`;
  out.style.fontFamily = `"${getFontState().current.family}", var(--ui-font)`;
}
