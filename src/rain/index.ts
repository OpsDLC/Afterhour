export { RainSim } from './sim.ts';
export type { Drop, Impact, RainOptions, Trail, TrailPoint } from './sim.ts';
export { FUSION_DEFAULTS, inkMaps, renderFusion, renderLens } from './render.ts';
export type { FusionOptions, InkMaps, Page } from './render.ts';

/** Prototype schedule: a drizzle that builds to full rain over the first 55% of a run. */
export const rampIntensity = (t: number, total: number) => Math.min(1, 0.12 + t / (total * 0.55));
