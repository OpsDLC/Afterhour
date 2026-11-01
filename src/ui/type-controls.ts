import { setAdjusting } from './artboard';
import { initScrub } from './scrub';
import { getFontState, subscribe } from '../fonts/state';
import { clamp, FONT_SIZE, nearestWeight, weightName, type Settings } from '../settings';

const weightStrip = document.getElementById('weight-strip')!;
const weightNameEl = document.getElementById('weight-name')!;
const sizeRange = document.getElementById('font-size-range') as HTMLInputElement;
const sizeNumber = document.getElementById('font-size-number') as HTMLInputElement;

/** Wires weight and size to `settings`; `changed` re-renders. Returns a function that syncs the UI. */
export function initTypeControls(settings: Settings, changed: () => void): () => void {
  // One "Aa" specimen per weight the current font has, drawn in that weight.
  let shownFor = '';
  const buildWeights = () => {
    const { family, weights } = getFontState().current;
    const key = `${family}|${weights.join()}`;
    if (key === shownFor) return;
    shownFor = key;
    weightStrip.replaceChildren(
      ...weights.map((w) => {
        const label = document.createElement('label');
        label.title = `${weightName(w)} ${w}`;
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'font-weight';
        radio.value = String(w);
        radio.setAttribute('aria-label', `${weightName(w)} ${w}`);
        const sample = document.createElement('span');
        sample.textContent = 'Aa';
        sample.style.fontFamily = `"${family}", var(--ui-font)`;
        sample.style.fontWeight = String(w);
        const number = document.createElement('small');
        number.textContent = String(w);
        label.append(radio, sample, number);
        return label;
      }),
    );
  };

  const sync = () => {
    buildWeights();
    for (const radio of weightStrip.querySelectorAll<HTMLInputElement>('input')) {
      radio.checked = Number(radio.value) === settings.fontWeight;
    }
    const only = getFontState().current.weights.length === 1 ? ' · only weight' : '';
    weightNameEl.textContent = `${weightName(settings.fontWeight)} · ${settings.fontWeight}${only}`;
    sizeRange.value = sizeNumber.value = String(settings.fontSize);
  };

  weightStrip.addEventListener('change', (e) => {
    settings.fontWeight = Number((e.target as HTMLInputElement).value);
    sync();
    changed();
  });

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

  // Scrub the Size label (H4N-42 · B); the number field already takes typing.
  const sizeLabel = document.querySelector<HTMLElement>('label[for="font-size-range"]');
  if (sizeLabel) {
    initScrub(sizeLabel, {
      get: () => settings.fontSize,
      set: (v) => setSize(Math.round(v)),
      perPx: 0.5,
      onStart: () => setAdjusting(true),
      onEnd: () => setAdjusting(false),
    });
  }

  // A new font may not have the current weight: move to the nearest one it has.
  subscribe(({ current }) => {
    settings.fontWeight = nearestWeight(current.weights, settings.fontWeight);
    sync();
    changed();
  });

  sync();
  return sync;
}
