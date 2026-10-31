import { clamp, type Align, type Settings } from '../settings';

type NumericKey = 'letterSpacing' | 'lineHeight' | 'maxWidth';

// Each slider's range comes from its min/max/step attributes in index.html.
const SLIDERS: { key: NumericKey; id: string; format: (v: number) => string }[] = [
  { key: 'letterSpacing', id: 'letter-spacing', format: (v) => `${v.toFixed(3)}em` },
  { key: 'lineHeight', id: 'line-height', format: (v) => v.toFixed(2) },
  { key: 'maxWidth', id: 'max-width', format: (v) => `${v}%` },
];

const alignRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="align"]'));

/** Wires tracking, line height, width and alignment to `settings`. Returns a function that syncs the UI. */
export function initLayoutControls(settings: Settings, changed: () => void): () => void {
  const sliders = SLIDERS.map((s) => ({
    ...s,
    input: document.getElementById(s.id) as HTMLInputElement,
    output: document.querySelector<HTMLOutputElement>(`output[for="${s.id}"]`)!,
  }));

  const sync = () => {
    for (const { key, input, output, format } of sliders) {
      input.value = String(settings[key]);
      output.value = format(settings[key]);
    }
    for (const radio of alignRadios) radio.checked = radio.value === settings.align;
  };

  for (const { key, input, output, format } of sliders) {
    input.addEventListener('input', () => {
      settings[key] = clamp(Number(input.value), Number(input.min), Number(input.max));
      output.value = format(settings[key]);
      changed();
    });
  }
  for (const radio of alignRadios) {
    radio.addEventListener('change', () => {
      settings.align = radio.value as Align;
      changed();
    });
  }

  sync();
  return sync;
}
