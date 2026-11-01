// Rains every Basic-Latin glyph of the test fonts and reports what H4N-29 promises:
// point-compatible masters and no new self-intersections. Run: npm run rainfont:check
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';
import { flatten, glyphSeed, rainGlyph } from '../src/rainfont/index.ts';

const fonts = ['EBGaramond-Regular', 'Arimo-Regular'];
const seed = Number(process.env.SEED ?? 11);
let failures = 0;
for (const name of fonts) {
  const font = opentype.parse(
    readFileSync(new URL(`../tests/fixtures/fonts/${name}-latin.ttf`, import.meta.url)).buffer,
  );
  const upm = 1000 / font.unitsPerEm;
  const bad: string[] = [];
  let glyphs = 0,
    ms = 0;
  for (let cp = 0x21; cp <= 0x7e; cp++) {
    const g = font.charToGlyph(String.fromCodePoint(cp));
    const cmds = g.path.commands.map((c) => {
      const o: Record<string, unknown> = { type: c.type };
      for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2'] as const)
        if (c[k] !== undefined) o[k] = c[k]! * upm;
      return o;
    });
    const base = flatten(cmds as never, 5);
    if (!base.length) continue;
    const t0 = performance.now();
    const r = rainGlyph(base, { seed: glyphSeed(seed, cp) });
    ms += performance.now() - t0;
    glyphs++;
    const compatible = r.masters.every(
      (m) => m.length === base.length && m.every((c, i) => c.length === base[i].length),
    );
    if (!compatible || r.newCrossings.some((n) => n))
      bad.push(
        `${String.fromCodePoint(cp)} ${r.newCrossings.join('/')}${compatible ? '' : ' incompatible'}`,
      );
  }
  failures += bad.length;
  console.log(
    `${name}: ${glyphs} glyphs, ${bad.length} with problems, ${Math.round(ms / glyphs)} ms/glyph${bad.length ? `\n  ${bad.join('\n  ')}` : ''}`,
  );
}
process.exit(failures ? 1 : 0);
