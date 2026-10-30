// Font loading and text layout into positioned glyph outlines (opentype.js).

import opentype from './vendor/opentype.js';
import { flattenCommands, ringsToMulti, bboxOfRings, signedArea } from './geometry.js';

export function parseFont(buffer) {
  const sig = new Uint8Array(buffer, 0, 4);
  if (String.fromCharCode(...sig) === 'wOF2') {
    throw new Error('WOFF2 is not supported yet — use a TTF, OTF or WOFF file.');
  }
  return opentype.parse(buffer);
}

/** Cap height of the font as a fraction of the em. */
export function capHeightRatio(font) {
  const os2 = font.tables.os2;
  if (os2 && os2.sCapHeight) return os2.sCapHeight / font.unitsPerEm;
  const H = font.charToGlyph('H');
  const bb = H && H.getBoundingBox();
  return bb && bb.y2 ? bb.y2 / font.unitsPerEm : 0.7;
}

/**
 * Lay out `text` (newlines = lines) at `size` px.
 * Returns { glyphs, width, height, H, outerSign } where each glyph is
 * { char, cmds, rings, poly, bbox } in px, with `origin` at the block's top-left.
 */
export function layoutText(font, text, { size = 200, lineHeight = 1.1, tracking = 0, align = 'center', flatten = 1, origin = [0, 0] } = {}) {
  const scale = size / font.unitsPerEm;
  const lines = String(text).replace(/\r/g, '').split('\n');
  const ascent = font.ascender * scale;
  const lineAdvance = size * lineHeight;

  const laid = lines.map((line) => {
    const glyphs = font.stringToGlyphs(line);
    const xs = [];
    let x = 0;
    for (let i = 0; i < glyphs.length; i++) {
      xs.push(x);
      x += glyphs[i].advanceWidth * scale + (tracking / 1000) * size;
      if (i < glyphs.length - 1) x += font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale;
    }
    if (glyphs.length) x -= (tracking / 1000) * size;
    return { glyphs, xs, width: x, chars: Array.from(line) };
  });
  const width = Math.max(1, ...laid.map((l) => l.width));

  const out = [];
  laid.forEach((l, li) => {
    const dx = align === 'left' ? 0 : align === 'right' ? width - l.width : (width - l.width) / 2;
    const baseline = origin[1] + ascent + li * lineAdvance;
    l.glyphs.forEach((g, gi) => {
      const path = g.getPath(origin[0] + dx + l.xs[gi], baseline, size);
      const cmds = path.commands;
      if (!cmds.length) return;
      const rings = flattenCommands(cmds, flatten);
      if (!rings.length) return;
      out.push({ char: l.chars[gi] ?? '', cmds, rings, poly: null, bbox: bboxOfRings(rings) });
    });
  });

  // Winding of outer contours in this font (TrueType and CFF differ); used to orient output.
  let outerSign = 1;
  let best = 0;
  for (const g of out) for (const r of g.rings) {
    const a = signedArea(r);
    if (Math.abs(a) > best) { best = Math.abs(a); outerSign = Math.sign(a); }
  }

  const descent = -font.descender * scale;
  const height = ascent + (lines.length - 1) * lineAdvance + descent;
  return { glyphs: out, width, height, H: size * capHeightRatio(font), outerSign };
}

/** Lazily build the boolean-ready polygon of a glyph (only needed when rain touches it). */
export function glyphPoly(g) {
  if (!g.poly) g.poly = ringsToMulti(g.rings);
  return g.poly;
}
