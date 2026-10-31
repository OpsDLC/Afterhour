import { clamp, type Align, type Settings } from '../settings';

type NumericKey = 'letterSpacing' | 'lineHeight' | 'maxWidth';
type AutoKey = 'autoTracking' | 'autoLineHeight';

// Each slider's range comes from its min/max/step attributes in index.html.
const SLIDERS: { key: NumericKey; id: string; auto?: AutoKey; format: (v: number) => string }[] = [
  {
    key: 'letterSpacing',
    id: 'letter-spacing',
    auto: 'autoTracking',
    format: (v) => `${v.toFixed(3)}em`,
  },
  { key: 'lineHeight', id: 'line-height', auto: 'autoLineHeight', format: (v) => v.toFixed(2) },
  { key: 'maxWidth', id: 'max-width', format: (v) => `${v}%` },
];

const alignRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="align"]'));

/** Wires tracking, line height, width and alignment to `settings`. Returns a function that syncs the UI. */
export function initLayoutControls(settings: Settings, changed: () => void): () => void {
  const sliders = SLIDERS.map((s) => ({
    ...s,
    input: document.getElementById(s.id) as HTMLInputElement,
    output: document.querySelector<HTMLOutputElement>(`output[for="${s.id}"]`)!,
    autoButton: document.querySelector<HTMLButtonElement>(`button[data-auto-for="${s.id}"]`),
  }));

  const sync = () => {
    for (const { key, input, output, format, auto, autoButton } of sliders) {
      input.value = String(settings[key]);
      output.value = format(settings[key]);
      if (auto && autoButton) autoButton.setAttribute('aria-pressed', String(settings[auto]));
    }
    for (const radio of alignRadios) radio.checked = radio.value === settings.align;
  };

  for (const { key, input, output, format, auto, autoButton } of sliders) {
    input.addEventListener('input', () => {
      settings[key] = clamp(Number(input.value), Number(input.min), Number(input.max));
      output.value = format(settings[key]);
      if (auto) settings[auto] = false; // a value set by hand stops following the size
      changed();
    });
    if (auto && autoButton) {
      autoButton.addEventListener('click', () => {
        settings[auto] = !settings[auto];
        changed();
      });
    }
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
