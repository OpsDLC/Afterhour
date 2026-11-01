import { getFontState } from '../fonts/state';
import type { Settings } from '../settings';
import { visualLines } from './text-lines';

/** Where the type sits on the artboard, in artboard px (H4N-41: what the rulers mark). */
export interface TypeMarks {
  /** Ink extent across all lines. */
  left: number;
  right: number;
  /** One per visual line. */
  baselines: number[];
  /** Cap height and x-height of the first line. */
  capHeight: number;
  xHeight: number;
}

const ctx = document.createElement('canvas').getContext('2d')!;

/** Measures the preview text as laid out; null when there is no text. */
export function measureType(
  text: HTMLElement,
  board: HTMLElement,
  zoom: number,
  settings: Settings,
): TypeMarks | null {
  const lines = visualLines(text);
  if (!lines.length) return null;
  ctx.font = `${settings.fontWeight} ${settings.fontSize}px "${getFontState().current.family}"`;
  ctx.letterSpacing = `${settings.letterSpacing * settings.fontSize}px`;
  const ascent = ctx.measureText('Hg').fontBoundingBoxAscent;
  const origin = board.getBoundingClientRect();
  let left = Infinity,
    right = -Infinity;
  const baselines: number[] = [];
  for (const l of lines) {
    const x = (l.left - origin.left) / zoom;
    const m = ctx.measureText(l.text.replace(/\s+$/, ''));
    left = Math.min(left, x - m.actualBoundingBoxLeft);
    right = Math.max(right, x + m.actualBoundingBoxRight);
    baselines.push((l.top - origin.top) / zoom + ascent);
  }
  const first = baselines[0];
  return {
    left,
    right,
    baselines,
    capHeight: first - ctx.measureText('H').actualBoundingBoxAscent,
    xHeight: first - ctx.measureText('x').actualBoundingBoxAscent,
  };
}
