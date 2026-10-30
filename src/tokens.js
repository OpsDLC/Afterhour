// Visual tokens — the single source of truth for colour and type (H4N-3).
// Amber is reserved for droplet highlights and splash glow; nothing else may use it.

export const color = Object.freeze({
  bg: '#14161A',
  text: '#E8E4DC',
  amber: '#E9B872',
});

export const font = Object.freeze({
  // Instrument Serif is self-hosted (assets/fonts, OFL). New York is used where the OS has it.
  family: '"Instrument Serif", "New York", "Iowan Old Style", "Songti SC", "Noto Serif SC", ui-serif, Georgia, serif',
  weight: 400,
  // Cap height of Instrument Serif relative to font size; "H" (letter height) is derived from it.
  capHeight: 0.7,
  lineHeight: 1.18,
  letterSpacingEm: 0.005,
});

/** Parse '#RRGGBB' into [r, g, b]. */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** CSS rgba() string for a token colour at a given alpha. */
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Expose tokens as CSS custom properties so the UI chrome uses the same values. */
export function applyCssTokens(root = document.documentElement) {
  root.style.setProperty('--bg', color.bg);
  root.style.setProperty('--text', color.text);
  root.style.setProperty('--amber', color.amber);
  root.style.setProperty('--font-serif', font.family);
}
