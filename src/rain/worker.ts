// Runs the rain engine off the main thread. Protocol in rain-panel.ts.
import { inkMaps, renderFusion, renderLens, RainSim, type InkMaps, type Page } from './index.ts';

export type View = 'lens' | 'fusion';

export type ToWorker =
  | { type: 'reset'; width: number; height: number; seed: number }
  | { type: 'page'; width: number; height: number; rgba: Uint8ClampedArray }
  | { type: 'frame'; dt: number; intensity: number; view: View; playing: boolean };

export interface FrameMessage {
  type: 'frame';
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  t: number;
  drops: number;
}

const STEP = 1 / 30; // the engine's fixed step (as approved in the prototype)
let sim: RainSim | null = null;
let page: Page | null = null;
let maps: InkMaps | null = null;
let t = 0;
let pending = 0;

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'reset') {
    sim = new RainSim({ width: m.width, height: m.height, seed: m.seed });
    t = 0;
    pending = 0;
  } else if (m.type === 'page') {
    page = { width: m.width, height: m.height, rgba: m.rgba };
    maps = null; // built lazily, only fusion needs it
  } else if (m.type === 'frame') {
    if (!sim || !page || page.width !== sim.width || page.height !== sim.height) {
      self.postMessage({ type: 'frame', rgba: null });
      return;
    }
    if (m.playing) {
      pending = Math.min(pending + m.dt, 0.25); // never try to catch up more than a few steps
      while (pending >= STEP) {
        t += STEP;
        sim.step(STEP, m.intensity, t);
        pending -= STEP;
      }
    }
    const out = new Uint8ClampedArray(sim.width * sim.height * 4);
    if (m.view === 'lens') renderLens(sim, page, t, out);
    else renderFusion(sim, (maps ??= inkMaps(page)), t, out);
    const msg: FrameMessage = {
      type: 'frame',
      rgba: out,
      width: sim.width,
      height: sim.height,
      t,
      drops: sim.drops.length,
    };
    (self as unknown as Worker).postMessage(msg, [out.buffer]);
  }
};
