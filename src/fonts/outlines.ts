// Glyph outlines of the current font (H4N-28 → used by the rain-font writer, H4N-29/30).
// opentype.js is loaded only when outlines are needed.
import { getFontFile } from './binary';
import type { FontInfo } from './state';

export async function loadOutlines(info: FontInfo, weight: number) {
  const [file, { parse }] = await Promise.all([getFontFile(info, weight), import('opentype.js')]);
  return parse(file);
}
