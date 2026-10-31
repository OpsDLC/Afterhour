import type { Settings } from './settings';

const out = document.getElementById('preview-text')!;

// The only code that writes to the preview. A canvas renderer can replace it later.
export function render(text: string, _settings: Settings): void {
  const empty = text.length === 0;
  out.textContent = empty ? 'Type something…' : text;
  out.classList.toggle('is-empty', empty);
}
