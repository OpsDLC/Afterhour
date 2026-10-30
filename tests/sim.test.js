import test from 'node:test';
import assert from 'node:assert/strict';
import { RainSim, mulberry32, quietDrive } from '../src/sim.js';
import { defaults } from '../src/params.js';
import { magnificationFor } from '../src/renderer.js';
import { RainDriver } from '../src/driver.js';

const H = 30;
const layout = { width: 800, height: 600, H, textBox: { x: 100, y: 200, w: 600, h: 200 } };

function makeSim(seed = 1) {
  const sim = new RainSim({ rand: mulberry32(seed) });
  sim.setLayout(layout);
  return sim;
}

const totalArea = (sim) => sim.drops.reduce((a, d) => a + Math.PI * d.r * d.r, 0);

test('touching drops merge and conserve area', () => {
  const sim = makeSim();
  const p = { ...defaults(), spawnRate: 0, evaporation: 0 };
  sim.addDrop(300, 300, 10, p);
  sim.addDrop(306, 300, 10, p);
  const before = totalArea(sim);
  sim.update(1 / 60, p, quietDrive);
  assert.equal(sim.drops.length, 1);
  assert.ok(Math.abs(totalArea(sim) - before) < 1e-6);
});

test('drops far apart do not merge', () => {
  const sim = makeSim();
  const p = { ...defaults(), spawnRate: 0, evaporation: 0 };
  sim.addDrop(100, 100, 10, p);
  sim.addDrop(200, 100, 10, p);
  sim.update(1 / 60, p, quietDrive);
  assert.equal(sim.drops.length, 2);
});

test('a large drop creeps, pauses, slides off and leaves a fading trail', () => {
  const sim = makeSim(2);
  const p = { ...defaults(), spawnRate: 0, residue: 0, evaporation: 0 };
  const d = sim.addDrop(400, 100, p.slideAt * H * 1.4, p);
  const states = new Set();
  let sawTrail = false;
  for (let i = 0; i < 60 * 20 && sim.drops.includes(d); i++) {
    sim.update(1 / 60, p, quietDrive);
    states.add(d.state);
    if (sim.trails.length) sawTrail = true;
  }
  assert.ok(states.has('creep') && states.has('pause') && states.has('slide'));
  assert.ok(!sim.drops.includes(d), 'drop left the screen');
  assert.ok(sawTrail);
  // Trail fades away after trailFade seconds.
  for (let i = 0; i < 60 * (p.trailFade + 1); i++) sim.update(1 / 60, p, quietDrive);
  assert.equal(sim.trails.length, 0);
});

test('small drops stay put', () => {
  const sim = makeSim();
  const p = { ...defaults(), spawnRate: 0, evaporation: 0 };
  const d = sim.addDrop(400, 300, p.smallMax * H, p);
  for (let i = 0; i < 120; i++) sim.update(1 / 60, p, quietDrive);
  assert.equal(d.state, 'rest');
  assert.equal(d.y, 300);
});

test('first five seconds keep coverage under the intro cap', () => {
  const sim = makeSim(3);
  const p = { ...defaults(), spawnRate: 40, merge: false };
  const drive = { ...quietDrive, rate: 40, fine: 40, burst: 2 };
  for (let i = 0; i < 60 * 5 - 1; i++) {
    sim.update(1 / 60, p, drive);
    assert.ok(sim.coverage() <= p.introCoverage + 1e-9, `coverage ${sim.coverage()} at ${sim.time}s`);
  }
  assert.ok(sim.drops.length > 10);
});

test('magnification follows the size anchors', () => {
  const p = defaults();
  assert.equal(magnificationFor(0.3, p), p.magSmall);
  assert.equal(magnificationFor(1.0, p), p.magMedium);
  assert.equal(magnificationFor(2.5, p), p.magLarge);
  const mid = magnificationFor(1.4, p);
  assert.ok(mid > p.magMedium && mid < p.magLarge);
});

test('driver: louder audio means more drops; bass raises slide boost', () => {
  const p = defaults();
  const quiet = new RainDriver(mulberry32(1));
  const loud = new RainDriver(mulberry32(1));
  let q, l;
  for (let i = 0; i < 60; i++) {
    q = quiet.drive({ level: 0.1, low: 0.1, high: 0.1, onset: 0, active: true }, p, 1 / 60, 'mic');
    l = loud.drive({ level: 0.9, low: 0.9, high: 0.9, onset: 0, active: true }, p, 1 / 60, 'mic');
  }
  assert.ok(l.rate > q.rate * 3);
  assert.ok(l.fine > q.fine);
  assert.ok(l.slideBoost > q.slideBoost);
  assert.ok(l.sizeMul > q.sizeMul);
  const hit = loud.drive({ level: 0.5, low: 0.5, high: 0.5, onset: 2, active: true }, p, 1 / 60, 'mic');
  assert.ok(hit.burst > 0);
});

test('still mode spawns nothing on its own', () => {
  const sim = makeSim();
  const p = defaults();
  const driver = new RainDriver(mulberry32(5));
  for (let i = 0; i < 300; i++) sim.update(1 / 60, p, driver.drive(null, p, 1 / 60, 'still'));
  assert.equal(sim.drops.length, 0);
});
