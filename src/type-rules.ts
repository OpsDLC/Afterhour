// Typographic rules of thumb as pure functions (no DOM), so they can move to DLC-UI.

/** [font size px, tracking em, line height] — larger type is set tighter in both directions. */
const ANCHORS: [number, number, number][] = [
  [12, 0.02, 1.5],
  [16, 0.01, 1.45],
  [24, 0, 1.35],
  [48, -0.01, 1.2],
  [96, -0.02, 1.05],
  [240, -0.03, 0.95],
];

function interpolate(size: number, column: 1 | 2): number {
  if (size <= ANCHORS[0][0]) return ANCHORS[0][column];
  for (let i = 1; i < ANCHORS.length; i++) {
    const [s1] = ANCHORS[i];
    if (size <= s1) {
      const [s0] = ANCHORS[i - 1];
      const t = (size - s0) / (s1 - s0);
      return ANCHORS[i - 1][column] + t * (ANCHORS[i][column] - ANCHORS[i - 1][column]);
    }
  }
  return ANCHORS[ANCHORS.length - 1][column];
}

/** Tracking (em) a typographer would start from at this size. */
export const trackingForSize = (size: number) => Math.round(interpolate(size, 1) * 1000) / 1000;

/** Line height (× size) a typographer would start from at this size. */
export const lineHeightForSize = (size: number) => Math.round(interpolate(size, 2) * 100) / 100;

/** Comfortable reading measure, in characters per line. */
export const COMFORTABLE_MEASURE = { min: 45, max: 75 };

/** Characters that fit on one line, from the line width and the average advance per character. */
export const charsPerLine = (lineWidth: number, averageAdvance: number) =>
  averageAdvance > 0 ? Math.round(lineWidth / averageAdvance) : 0;
