// Renders the words into an opaque off-screen texture at device resolution (H4N-3).
// The texture is what droplets refract; the visible page is drawn from it too.

import { color, font } from './tokens.js';

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function fontString(size) {
  return `${font.weight} ${size}px ${font.family}`;
}

/** Greedy word wrap. Breaks CJK text between characters, Latin text between words. */
function wrap(ctx, paragraph, maxWidth) {
  const tokens = paragraph.match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+|\s+/g) || [''];
  const lines = [];
  let line = '';
  for (const tok of tokens) {
    const next = line + tok;
    if (line && ctx.measureText(next.trimEnd()).width > maxWidth && !/^\s+$/.test(tok)) {
      lines.push(line.trimEnd());
      line = tok.trimStart();
    } else {
      line = next;
    }
  }
  lines.push(line.trimEnd());
  return lines;
}

/**
 * Lay out and render `text` for a viewport of cssW × cssH at pixel ratio `dpr`.
 * Returns { canvas, dpr, fontSize, H, textBox } where textBox is in CSS px.
 */
export function renderTextTexture(text, cssW, cssH, dpr) {
  const canvas = makeCanvas(Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr)));
  const ctx = canvas.getContext('2d');
  const paragraphs = String(text).replace(/\r/g, '').split('\n');

  const maxWidth = Math.min(cssW * 0.84, 980);
  const maxHeight = cssH * 0.66;
  const start = Math.min(132, Math.max(22, Math.min(cssW / 8.5, cssH / 7)));
  const fit = (allowWrap, floor) => {
    for (let size = start; size >= floor; size *= 0.96) {
      ctx.font = fontString(size);
      const lines = paragraphs.flatMap((p) => wrap(ctx, p, maxWidth));
      if (!allowWrap && lines.length > paragraphs.length) continue;
      const tooWide = lines.some((l) => ctx.measureText(l).width > maxWidth);
      if (!tooWide && lines.length * size * font.lineHeight <= maxHeight) return { size, lines };
    }
    return null;
  };
  // Prefer keeping each written line whole (shrinking up to 25%); otherwise wrap at full size.
  let { size, lines } = fit(false, start * 0.75) || fit(true, 16) || (() => {
    ctx.font = fontString(16);
    return { size: 16, lines: paragraphs.flatMap((p) => wrap(ctx, p, maxWidth)) };
  })();

  const lineH = size * font.lineHeight;
  const blockH = lines.length * lineH;
  const top = (cssH - blockH) / 2;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = color.bg;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.font = fontString(size);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${font.letterSpacingEm * size}px`;
  ctx.fillStyle = color.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let minX = cssW;
  let maxX = 0;
  lines.forEach((l, i) => {
    const baseline = top + i * lineH + lineH * 0.5 + size * font.capHeight * 0.5;
    ctx.fillText(l, cssW / 2, baseline);
    const w = ctx.measureText(l).width;
    minX = Math.min(minX, cssW / 2 - w / 2);
    maxX = Math.max(maxX, cssW / 2 + w / 2);
  });
  if (maxX < minX) { minX = cssW * 0.3; maxX = cssW * 0.7; }

  return {
    canvas,
    dpr,
    fontSize: size,
    H: size * font.capHeight,
    lines,
    textBox: { x: minX, y: top, w: maxX - minX, h: blockH },
  };
}
