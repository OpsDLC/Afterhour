import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { RainSim, inkMaps, rampIntensity, renderFusion, renderLens } from '../src/rain/index.ts';
import * as pm from '../src/rain/pmath.ts';

const require = createRequire(import.meta.url);
const { stateHash, pixelHash, STEPS, FPS, TOTAL } = require('./rain-hash.cjs');
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/rain-parity.json', import.meta.url), 'utf8'),
);
const W = 960,
  H = 540;

function run(seed: number, onStep?: (i: number, sim: RainSim) => void): RainSim {
  const sim = new RainSim({ width: W, height: H, seed });
  for (let i = 0; i < TOTAL; i++) {
    const t = i / FPS;
    sim.step(1 / FPS, rampIntensity(t, TOTAL / FPS), t);
    onStep?.(i, sim);
  }
  return sim;
}

test('portable math stays within a few ulp of Math', () => {
  let s = 3;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  for (let i = 0; i < 20000; i++) {
    const x = r() * 60 - 30,
      p = r() * 3000 + 1e-6,
      a = r(),
      y = r() * 4,
      ang = r() * 4000;
    assert.ok(rel(pm.exp(x), Math.exp(x)) < 1e-15, `exp ${x}`);
    assert.ok(rel(pm.log(p), Math.log(p)) < 1e-15, `log ${p}`);
    assert.ok(rel(pm.cbrt(p), Math.cbrt(p)) < 1e-15, `cbrt ${p}`);
    assert.ok(rel(pm.pow(a, y), Math.pow(a, y)) < 1e-13, `pow ${a} ${y}`);
    assert.ok(Math.abs(pm.sin(ang) - Math.sin(ang)) < 1e-15, `sin ${ang}`);
    assert.ok(Math.abs(pm.cos(ang) - Math.cos(ang)) < 1e-15, `cos ${ang}`);
  }
});

test('same seed gives the same storm; another seed does not', () => {
  const a = run(11),
    b = run(11),
    c = run(12);
  assert.equal(stateHash(a), stateHash(b));
  assert.notEqual(stateHash(a), stateHash(c));
});

test('matches the approved prototype bit for bit (state)', () => {
  run(11, (i, sim) => {
    if (!STEPS.includes(i)) return;
    const want = fixture.steps[i];
    assert.equal(sim.drops.length, want.drops, `drops at step ${i}`);
    assert.equal(sim.trails.length, want.trails, `trails at step ${i}`);
    assert.equal(stateHash(sim), want.hash, `state at step ${i}`);
  });
});

test('matches the approved prototype pixel for pixel (lens and fusion)', () => {
  const gray = gunzipSync(readFileSync(new URL('./fixtures/rain-page.gray.gz', import.meta.url)));
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray[i];
    rgba[i * 4 + 3] = 255;
  }
  const page = { width: W, height: H, rgba };
  const sim = run(11),
    t = (TOTAL - 1) / FPS,
    out = new Uint8ClampedArray(W * H * 4);
  renderLens(sim, page, t, out);
  assert.equal(pixelHash(out, W, H), fixture.lens, 'lens');
  renderFusion(sim, inkMaps(page), t, out);
  assert.equal(pixelHash(out, W, H), fixture.fusion, 'fusion');
});

test('dry glass leaves the page untouched', () => {
  const rgba = new Uint8ClampedArray(64 * 64 * 4).fill(255);
  for (let i = 0; i < 64 * 20; i++) rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 0; // ink band
  const page = { width: 64, height: 64, rgba },
    sim = new RainSim({ width: 64, height: 64 });
  const lens = new Uint8ClampedArray(rgba.length),
    fusion = new Uint8ClampedArray(rgba.length);
  renderLens(sim, page, 0, lens);
  assert.deepEqual(lens, rgba);
  renderFusion(sim, inkMaps(page), 0, fusion);
  assert.deepEqual(fusion, rgba);
});

test('without rain, water is never lost on the glass (merges conserve volume)', () => {
  // after one second of rain, nothing adds water except beads (the drop pays 0.9× what it leaves),
  // so total volume must not fall unless a drop runs off the bottom edge
  const sim = new RainSim({ width: 320, height: 540, seed: 5 });
  for (let i = 0; i < 30; i++) sim.step(1 / 30, 1, i / 30);
  const volume = () => sim.drops.reduce((s, d) => s + d.r ** 3, 0);
  let merges = 0;
  for (let i = 30; i < 600; i++) {
    const before = volume(),
      n = sim.drops.length,
      nearEdge = sim.drops.some((d) => d.y + d.r + 40 > 540);
    sim.step(1 / 30, 0, i / 30);
    if (sim.drops.length < n) merges++;
    if (!nearEdge) assert.ok(volume() >= before * (1 - 1e-12), `water lost at step ${i}`);
  }
  assert.ok(merges > 0, 'expected some merges');
});
