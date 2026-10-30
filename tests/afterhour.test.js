import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RainSim, mulberry32 } from '../src/sim.js';
import { defaults } from '../src/params.js';
import { lensProfile, magnificationFor, dropMapper, trailWarper } from '../src/lens.js';
import { flattenCommands, ringsToMulti, fitRingToD, commandsToD } from '../src/geometry.js';
import { parseFont, layoutText } from '../src/font.js';
import { compose } from '../src/compose.js';
import { Engine } from '../src/engine.js';
import { buildSvg } from '../src/svg.js';

const buf = fs.readFileSync(new URL('../assets/fonts/InstrumentSerif-Regular.ttf', import.meta.url));
const font = parseFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const H = 30;
const simLayout = { width: 800, height: 600, H, textBox: { x: 100, y: 200, w: 600, h: 200 } };

function makeSim(seed = 1) {
  const sim = new RainSim({ rand: mulberry32(seed) });
  sim.setLayout(simLayout);
  return sim;
}
const totalArea = (sim) => sim.drops.reduce((a, d) => a + Math.PI * d.r * d.r, 0);

// ---- Simulation -------------------------------------------------------------

test('touching drops merge and conserve area', () => {
  const sim = makeSim();
  const p = { ...defaults(), spawnRate: 0, evaporation: 0 };
  sim.addDrop(300, 300, 10);
  sim.addDrop(306, 300, 10);
  const before = totalArea(sim);
  sim.update(1 / 60, p);
  assert.equal(sim.drops.length, 1);
  assert.ok(Math.abs(totalArea(sim) - before) < 1e-6);
});

test('a large drop creeps, pauses, slides off and its trail fades', () => {
  const sim = makeSim(2);
  const p = { ...defaults(), spawnRate: 0, residue: 0, evaporation: 0 };
  const d = sim.addDrop(400, 100, p.slideAt * H * 1.4);
  const states = new Set();
  let sawTrail = false;
  for (let i = 0; i < 60 * 20 && sim.drops.includes(d); i++) {
    sim.update(1 / 60, p);
    states.add(d.state);
    if (sim.trails.length) sawTrail = true;
  }
  assert.ok(states.has('creep') && states.has('pause') && states.has('slide'));
  assert.ok(!sim.drops.includes(d));
  assert.ok(sawTrail);
  for (let i = 0; i < 60 * (p.trailFade + 1); i++) sim.update(1 / 60, p);
  assert.equal(sim.trails.length, 0);
  assert.ok(sim.drops.every((x) => Number.isFinite(x.r)));
});

test('first five seconds keep coverage under the intro cap', () => {
  const sim = makeSim(3);
  const p = { ...defaults(), spawnRate: 40, merge: false };
  for (let i = 0; i < 60 * 5 - 1; i++) {
    sim.update(1 / 60, p);
    assert.ok(sim.coverage() <= p.introCoverage + 1e-9);
  }
  assert.ok(sim.drops.length > 10);
});

test('same seed, same rain', () => {
  const p = defaults();
  const a = makeSim(42), b = makeSim(42);
  for (let i = 0; i < 600; i++) { a.update(1 / 60, p); b.update(1 / 60, p); }
  assert.deepEqual(a.drops.map((d) => [d.x, d.y, d.r]), b.drops.map((d) => [d.x, d.y, d.r]));
});

// ---- Lens -------------------------------------------------------------------

test('lens profile: inverse, continuity and rim', () => {
  for (const [m, e, g] of [[1.6, 0.15, 1], [2, 0.3, 3], [1.3, 0, 0]]) {
    const prof = lensProfile(m, e, g);
    for (let u = 0; u <= 1; u += 0.01) assert.ok(Math.abs(prof.hInv(prof.h(u)) - u) < 1e-9);
    assert.ok(Math.abs(prof.h(1) - prof.vmax) < 1e-9);
    assert.ok(Math.abs(prof.h(1 - e) - (1 - e) / m) < 1e-9);
  }
});

test('drop mapper magnifies about the centre and flips when asked', () => {
  const shape = { cx: 100, cy: 100, rx: 20, ry: 20 };
  const prof = lensProfile(2, 0, 0);
  const [x1, y1] = dropMapper(shape, prof, false)(105, 100);
  assert.ok(Math.abs(x1 - 110) < 1e-9 && Math.abs(y1 - 100) < 1e-9);
  const [x2, y2] = dropMapper(shape, prof, true)(105, 102);
  assert.ok(Math.abs(x2 - 90) < 1e-9 && Math.abs(y2 - 96) < 1e-9);
});

test('magnification follows the size anchors', () => {
  const p = defaults();
  assert.equal(magnificationFor(0.3, p), p.magSmall);
  assert.equal(magnificationFor(1.0, p), p.magMedium);
  assert.equal(magnificationFor(2.5, p), p.magLarge);
});

test('trail warp: identity outside the band, monotonic inside', () => {
  const p = defaults();
  const trails = [{ points: Array.from({ length: 40 }, (_, i) => ({ x: 200, y: 100 + i * 5, w: 20, t: 10 })) }];
  const { warp } = trailWarper(trails, p, 10);
  assert.deepEqual(warp(150, 150), [150, 150]);
  assert.deepEqual(warp(200, 50), [200, 50]);
  let prev = -Infinity;
  for (let x = 185; x <= 215; x += 0.25) {
    const [nx] = warp(x, 200);
    assert.ok(nx > prev);
    prev = nx;
  }
  const [edge] = warp(210, 200);
  assert.ok(Math.abs(edge - 210) < 1e-9);
});

// ---- Geometry -----------------------------------------------------------------

test('glyph with a counter keeps its hole', () => {
  const path = font.charToGlyph('o').getPath(0, 200, 200);
  const rings = flattenCommands(path.commands, 1);
  assert.equal(rings.length, 2);
  const mp = ringsToMulti(rings);
  assert.equal(mp.length, 1);
  assert.equal(mp[0].length, 2, 'outer + hole');
});

test('Bézier fitting stays within tolerance of the input polyline', () => {
  const ring = [];
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    ring.push([100 + Math.cos(a) * 50, 100 + Math.sin(a) * 30]);
  }
  const d = fitRingToD(ring, 0.1);
  const curves = d.match(/C/g) || [];
  assert.ok(curves.length >= 2 && curves.length < 20, `${curves.length} curves`);
  // Sample the fitted curves and check distance to the ellipse.
  const nums = d.replace(/[MZ]/g, ' ').split(/[C\s]+/).filter(Boolean).map(Number);
  let px = nums[0], py = nums[1];
  for (let i = 2; i + 5 < nums.length; i += 6) {
    const [x1, y1, x2, y2, x, y] = nums.slice(i, i + 6);
    for (let t = 0; t <= 1; t += 0.05) {
      const mt = 1 - t;
      const bx = mt ** 3 * px + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t ** 3 * x;
      const by = mt ** 3 * py + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t ** 3 * y;
      const r = Math.hypot((bx - 100) / 50, (by - 100) / 30);
      assert.ok(Math.abs(r - 1) * 30 < 0.3, `off by ${(Math.abs(r - 1) * 30).toFixed(3)}px`);
    }
    px = x; py = y;
  }
});

// ---- Composition ----------------------------------------------------------------

const layout = () => layoutText(font, 'rain', { size: 200, origin: [40, 40] });

test('no rain: every glyph keeps its original font outline', () => {
  const L = layout();
  const sim = makeSim();
  const out = compose(L, sim, defaults());
  assert.equal(out.stats.touched, 0);
  assert.deepEqual(out.paths.map((p) => p.d), L.glyphs.map((g) => commandsToD(g.cmds)));
});

test('a drop on a glyph reshapes only that glyph', () => {
  const L = layout();
  const g = L.glyphs[1];
  const sim = makeSim();
  sim.addDrop((g.bbox.x0 + g.bbox.x1) / 2, (g.bbox.y0 + g.bbox.y1) / 2, L.H * 0.8);
  const p = defaults();
  const out = compose(L, sim, p);
  assert.equal(out.stats.failures, 0);
  assert.ok(out.stats.touched >= 1 && out.stats.touched < L.glyphs.length);
  const flipped = compose(L, sim, { ...p, flip: false });
  assert.notEqual(out.paths.map((x) => x.d).join(''), flipped.paths.map((x) => x.d).join(''));
});

test('WOFF2 fonts are rejected with a clear message', () => {
  const b = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]).buffer;
  assert.throws(() => parseFont(b), /WOFF2/);
});

// ---- Engine & SVG ---------------------------------------------------------------

test('engine is deterministic and scrubbing back replays the same frame', () => {
  const e = new Engine(font);
  const p = { ...defaults(), time: 6 };
  const a = e.render('Afterhour', p).paths.map((x) => x.d).join('');
  e.render('Afterhour', { ...p, time: 9 });
  const b = e.render('Afterhour', p).paths.map((x) => x.d).join('');
  const c = new Engine(font).render('Afterhour', p).paths.map((x) => x.d).join('');
  assert.equal(a, b);
  assert.equal(a, c);
});

test('SVG output: one path, background only when asked', () => {
  const svg = buildSvg('M0 0L10 0L10 10Z', { width: 100, height: 50 }, { ink: '#E8E4DC', paper: '#14161A' });
  assert.match(svg, /viewBox="0 0 100 50"/);
  assert.equal((svg.match(/<path /g) || []).length, 1);
  assert.doesNotMatch(svg, /<rect/);
  assert.match(buildSvg('', { width: 1, height: 1 }, { ink: '#000', paper: '#fff', background: true }), /<rect/);
});
