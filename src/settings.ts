export const DEFAULT_TEXT = 'Afterhour\nthe rain keeps the letters awake';

// Every typographic setting lives here. JSON-serialisable.
export interface Settings {
  fontWeight: number;
  /** px */
  fontSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
  fontWeight: 400,
  fontSize: 64,
};

export const FONT_SIZE = { min: 12, max: 240 };

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** The available weight closest to `weight` (ties go to the lighter one). */
export function nearestWeight(weights: number[], weight: number): number {
  return weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));
}
