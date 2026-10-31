import { getFontState, subscribe } from '../fonts/state';
import { clamp, FONT_SIZE, nearestWeight, type Settings } from '../settings';

const weightRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="font-weight"]'),
);
const sizeRange = document.getElementById('font-size-range') as HTMLInputElement;
const sizeNumber = document.getElementById('font-size-number') as HTMLInputElement;

/** Wires weight and size to `settings`; `changed` re-renders. Returns a function that syncs the UI. */
export function initTypeControls(settings: Settings, changed: () => void): () => void {
  const sync = () => {
    const { weights } = getFontState().current;
    for (const radio of weightRadios) {
      const w = Number(radio.value);
      radio.disabled = !weights.includes(w);
      radio.checked = w === settings.fontWeight;
    }
    sizeRange.value = sizeNumber.value = String(settings.fontSize);
  };

  for (const radio of weightRadios) {
    radio.addEventListener('change', () => {
      settings.fontWeight = Number(radio.value);
      changed();
    });
  }

  const setSize = (value: number) => {
    settings.fontSize = clamp(Math.round(value), FONT_SIZE.min, FONT_SIZE.max);
    sync();
    changed();
  };
  sizeRange.addEventListener('input', () => setSize(Number(sizeRange.value)));
  // Typed values apply on commit; non-numbers fall back to the last valid size.
  sizeNumber.addEventListener('change', () => {
    const value = Number(sizeNumber.value);
    if (sizeNumber.value.trim() === '' || !Number.isFinite(value)) sync();
    else setSize(value);
  });

  // A new font may not have the current weight: move to the nearest one it has.
  subscribe(({ current }) => {
    settings.fontWeight = nearestWeight(current.weights, settings.fontWeight);
    sync();
    changed();
  });

  sync();
  return sync;
}
