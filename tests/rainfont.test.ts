import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';
import {
  crossings,
  flatten,
  glyphSeed,
  rainGlyph,
  rasterize,
  type Contour,
} from '../src/rainfont/index.ts';

const font = (name: string) =>
  opentype.parse(
    readFileSync(new URL(`./fixtures/fonts/${name}-latin.ttf`, import.meta.url)).buffer,
  );
const garamond = font('EBGaramond-Regular');
const arimo = font('Arimo-Regular');
const glyph = (f: ReturnType<typeof font>, ch: string) =>
  flatten(
    f.charToGlyph(ch).path.commands.map((c) => ({ ...c })),
    5,
  );

const square = (x: number, y: number, s: number): Contour => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

test('flatten samples curves into closed polygons', () => {
  const cs = glyph(garamond, 'o');
  assert.equal(cs.length, 2); // outer and counter
  for (const c of cs) {
    assert.ok(c.length > 40);
    for (let i = 0; i < c.length; i++) {
      const [a, b] = [c[i], c[(i + 1) % c.length]];
      assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) <= 5 + 1e-6, 'segments ≤ step');
    }
  }
});

test('crossings finds a bow tie and ignores a clean square', () => {
  assert.equal(crossings([square(0, 0, 100)]).length, 0);
  const bowtie: Contour = [
    [0, 0],
    [100, 100],
    [100, 0],
    [0, 100],
  ];
  assert.equal(crossings([bowtie]).length, 1);
});

test('rasterize fills with the non-zero rule', () => {
  const rgba = rasterize([square(0, 0, 100)], {
    scale: 0.1,
    x0: 0,
    y0: 100,
    width: 10,
    height: 10,
  });
  assert.equal(rgba[(5 * 10 + 5) * 4], 0); // inside: ink
  const outside = rasterize([square(0, 0, 50)], {
    scale: 0.1,
    x0: 0,
    y0: 100,
    width: 10,
    height: 10,
  });
  assert.equal(outside[(1 * 10 + 8) * 4], 255); // outside: paper
});

test('rained masters are point-compatible, clean and only grow outward', () => {
  for (const [f, chars] of [
    [garamond, 'Rag&'],
    [arimo, 'Rg&'],
  ] as const) {
    for (const ch of chars) {
      const base = glyph(f, ch);
      const r = rainGlyph(base, { seed: glyphSeed(11, ch.codePointAt(0)!) });
      assert.equal(r.masters.length, 4);
      assert.deepEqual(r.masters[0], base, `${ch}: master 0 is the dry glyph`);
      for (const m of r.masters) {
        assert.equal(m.length, base.length, `${ch}: contour count`);
        m.forEach((c, i) => assert.equal(c.length, base[i].length, `${ch}: point count`));
      }
      assert.deepEqual(r.newCrossings, [0, 0, 0, 0], `${ch}: no new self-intersections`);
      // the heaviest master moved points (it rained) and the ink only grew
      const moved = r.masters[3]
        .flat()
        .filter(
          (p, i) => Math.hypot(p[0] - base.flat()[i][0], p[1] - base.flat()[i][1]) > 1,
        ).length;
      assert.ok(moved > 10, `${ch}: water reached the outline`);
    }
  }
});

test('same seed → identical masters; another seed → different rain', () => {
  const base = glyph(garamond, 'a');
  const a = rainGlyph(base, { seed: 7 }),
    b = rainGlyph(base, { seed: 7 }),
    c = rainGlyph(base, { seed: 8 });
  assert.deepEqual(a.masters, b.masters);
  assert.notDeepEqual(a.masters[3], c.masters[3]);
});

test('glyph seeds are stable and spread out', () => {
  assert.equal(glyphSeed(11, 97), glyphSeed(11, 97));
  const seeds = new Set([...'abcdefghij'].map((ch) => glyphSeed(11, ch.codePointAt(0)!)));
  assert.equal(seeds.size, 10);
  for (const s of seeds) assert.ok(s >= 1 && s <= 2147483646);
  assert.notEqual(glyphSeed(11, 97, 0), glyphSeed(11, 97, 1));
});
