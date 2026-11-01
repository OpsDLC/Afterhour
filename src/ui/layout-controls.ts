import { clamp, type Align, type Settings } from '../settings';
import { setAdjusting } from './artboard';
import { initScrub, initTypeIn } from './scrub';

type NumericKey = 'letterSpacing' | 'lineHeight' | 'maxWidth';
type AutoKey = 'autoTracking' | 'autoLineHeight';

// Each slider's range comes from its min/max/step attributes in index.html.
// perPx and step drive scrubbing the label or value (H4N-42 · B).
const SLIDERS: {
  key: NumericKey;
  id: string;
  auto?: AutoKey;
  format: (v: number) => string;
  perPx: number;
  step: number;
}[] = [
  {
    key: 'letterSpacing',
    id: 'letter-spacing',
    auto: 'autoTracking',
    format: (v) => `${v.toFixed(3)}em`,
    perPx: 0.001,
    step: 0.001,
  },
  {
    key: 'lineHeight',
    id: 'line-height',
    auto: 'autoLineHeight',
    format: (v) => v.toFixed(2),
    perPx: 0.005,
    step: 0.01,
  },
  { key: 'maxWidth', id: 'max-width', format: (v) => `${v}%`, perPx: 0.25, step: 1 },
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
  // Scrub the label or the value; double-click the value to type one.
  for (const { key, input, output, auto, perPx, step } of sliders) {
    const apply = (v: number) => {
      if (!Number.isFinite(v)) return;
      const min = Number(input.min),
        max = Number(input.max);
      settings[key] = Math.round(clamp(v, min, max) / step) * step;
      if (auto) settings[auto] = false;
      changed();
    };
    const label = document.querySelector<HTMLElement>(`label[for="${input.id}"]`);
    for (const el of [label, output]) {
      if (!el) continue;
      initScrub(el, {
        get: () => settings[key],
        set: apply,
        perPx,
        onStart: () => setAdjusting(true),
        onEnd: () => setAdjusting(false),
      });
    }
    initTypeIn(output, {
      get: () => String(settings[key]),
      set: (raw) => apply(parseFloat(raw.replace(',', '.'))),
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
