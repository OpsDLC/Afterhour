export const DEFAULT_TEXT = 'Afterhour\nthe rain keeps the letters awake';

// Every typographic setting lives here. JSON-serialisable.
export type Align = 'left' | 'center' | 'right';

export interface Settings {
  fontWeight: number;
  /** px */
  fontSize: number;
  /** em */
  letterSpacing: number;
  /** multiple of the font size */
  lineHeight: number;
  align: Align;
  /** % of the preview width */
  maxWidth: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  fontWeight: 400,
  fontSize: 64,
  letterSpacing: 0,
  lineHeight: 1.2,
  align: 'left',
  maxWidth: 80,
};

export const FONT_SIZE = { min: 12, max: 240 };

/** Ranges for every numeric setting (the sliders in index.html use the same values). */
export const LIMITS = {
  fontSize: FONT_SIZE,
  letterSpacing: { min: -0.05, max: 0.5 },
  lineHeight: { min: 0.8, max: 2.5 },
  maxWidth: { min: 20, max: 100 },
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

export const weightName = (weight: number) => WEIGHT_NAMES[weight] ?? String(weight);

/** The available weight closest to `weight` (ties go to the lighter one). */
export function nearestWeight(weights: number[], weight: number): number {
  return weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));
}
