// Tunable parameters. Sizes are in letter heights (H) unless noted, so behaviour
// scales with the type. Defaults follow the Creative Director tuning spec (H4N-9).
// The debug panel is generated from this schema.

export const schema = [
  // Rain
  { key: 'spawnRate', group: 'Rain', label: 'Drops / second', min: 0, max: 40, step: 0.5, value: 5 },
  { key: 'smallShare', group: 'Rain', label: 'Small drop share', min: 0, max: 1, step: 0.05, value: 0.7 },
  { key: 'largeShare', group: 'Rain', label: 'Large drop share', min: 0, max: 0.5, step: 0.01, value: 0.05 },
  { key: 'textBias', group: 'Rain', label: 'Aim at text', min: 0, max: 1, step: 0.05, value: 0.75 },
  { key: 'introCoverage', group: 'Rain', label: 'First 5 s max cover', min: 0.05, max: 1, step: 0.01, value: 0.25 },
  { key: 'maxCoverage', group: 'Rain', label: 'Steady max cover', min: 0.05, max: 1, step: 0.01, value: 0.45 },
  { key: 'evaporation', group: 'Rain', label: 'Evaporation (H/min)', min: 0, max: 0.5, step: 0.01, value: 0.04 },

  // Size (diameters, in H)
  { key: 'smallMin', group: 'Size', label: 'Small min (H)', min: 0.1, max: 1, step: 0.05, value: 0.3 },
  { key: 'smallMax', group: 'Size', label: 'Small max (H)', min: 0.1, max: 1, step: 0.05, value: 0.6 },
  { key: 'mediumMin', group: 'Size', label: 'Medium min (H)', min: 0.3, max: 2, step: 0.05, value: 0.8 },
  { key: 'mediumMax', group: 'Size', label: 'Medium max (H)', min: 0.3, max: 2, step: 0.05, value: 1.2 },
  { key: 'largeMax', group: 'Size', label: 'Large max (H)', min: 0.5, max: 3, step: 0.05, value: 1.8 },
  { key: 'sizeScale', group: 'Size', label: 'Global size ×', min: 0.25, max: 3, step: 0.05, value: 1 },

  // Lens
  { key: 'magSmall', group: 'Lens', label: 'Magnify small', min: 1, max: 3, step: 0.05, value: 1.3 },
  { key: 'magMedium', group: 'Lens', label: 'Magnify medium', min: 1, max: 3, step: 0.05, value: 1.6 },
  { key: 'magLarge', group: 'Lens', label: 'Magnify large', min: 1, max: 4, step: 0.05, value: 2.0 },
  { key: 'flip', group: 'Lens', label: 'Flip image', type: 'bool', value: true },
  { key: 'edgeFalloff', group: 'Lens', label: 'Edge falloff', min: 0, max: 0.5, step: 0.01, value: 0.15 },
  { key: 'ringOpacity', group: 'Lens', label: 'Dark ring opacity', min: 0, max: 1, step: 0.01, value: 0.35 },
  { key: 'highlight', group: 'Lens', label: 'Highlight', min: 0, max: 1, step: 0.01, value: 0.55 },

  // Merge & slide
  { key: 'merge', group: 'Slide', label: 'Merge on touch', type: 'bool', value: true },
  { key: 'slideAt', group: 'Slide', label: 'Slide at diameter (H)', min: 0.5, max: 3, step: 0.05, value: 1.3 },
  { key: 'creepSpeed', group: 'Slide', label: 'Creep (H/s)', min: 0, max: 1, step: 0.01, value: 0.1 },
  { key: 'creepTime', group: 'Slide', label: 'Creep time (s)', min: 0, max: 4, step: 0.05, value: 0.8 },
  { key: 'pauseTime', group: 'Slide', label: 'Pause (s)', min: 0, max: 2, step: 0.05, value: 0.3 },
  { key: 'slideMin', group: 'Slide', label: 'Slide min (H/s)', min: 0.5, max: 10, step: 0.1, value: 2 },
  { key: 'slideMax', group: 'Slide', label: 'Slide max (H/s)', min: 0.5, max: 15, step: 0.1, value: 4 },
  { key: 'wander', group: 'Slide', label: 'Sideways wander', min: 0, max: 1, step: 0.01, value: 0.25 },
  { key: 'massLoss', group: 'Slide', label: 'Mass left per H', min: 0, max: 0.1, step: 0.002, value: 0.018 },
  { key: 'slideSpeedScale', group: 'Slide', label: 'Speed ×', min: 0, max: 3, step: 0.05, value: 1 },

  // Trail
  { key: 'trailWidth', group: 'Trail', label: 'Width (× diameter)', min: 0.05, max: 0.6, step: 0.01, value: 0.2 },
  { key: 'trailMag', group: 'Trail', label: 'Text magnify', min: 1, max: 1.5, step: 0.01, value: 1.1 },
  { key: 'trailSheen', group: 'Trail', label: 'Sheen', min: 0, max: 0.2, step: 0.005, value: 0.04 },
  { key: 'trailFade', group: 'Trail', label: 'Fade (s)', min: 0.5, max: 12, step: 0.1, value: 5 },
  { key: 'residue', group: 'Trail', label: 'Residue drops / H', min: 0, max: 1, step: 0.01, value: 0.12 },

  // Render
  { key: 'splash', group: 'Render', label: 'Splash glow', min: 0, max: 1, step: 0.01, value: 0.5 },
  { key: 'pixelRatio', group: 'Render', label: 'Max pixel ratio', min: 0.5, max: 3, step: 0.25, value: 2 },
  { key: 'autoQuality', group: 'Render', label: 'Auto quality', type: 'bool', value: true },
  { key: 'reducedMotion', group: 'Render', label: 'Reduced motion', type: 'bool', value: false },
  { key: 'stats', group: 'Render', label: 'Show stats', type: 'bool', value: false },

  // Audio mapping
  { key: 'audioGain', group: 'Audio', label: 'Sensitivity', min: 0, max: 3, step: 0.05, value: 1 },
  { key: 'audioRate', group: 'Audio', label: 'Loudness → drops/s', min: 0, max: 60, step: 1, value: 18 },
  { key: 'onsetBurst', group: 'Audio', label: 'Hit → drops', min: 0, max: 6, step: 1, value: 2 },
  { key: 'fineRate', group: 'Audio', label: 'Treble → fine drops/s', min: 0, max: 60, step: 1, value: 24 },
  { key: 'lowSlide', group: 'Audio', label: 'Bass → slide', min: 0, max: 3, step: 0.05, value: 1 },
];

export function defaults() {
  const out = {};
  for (const p of schema) out[p.key] = p.value;
  return out;
}

/** Overrides applied when the viewer prefers (or asks for) reduced motion. */
export const reducedMotionOverrides = {
  spawnRate: 1.5,
  slideSpeedScale: 0.35,
  splash: 0,
  audioRate: 5,
  fineRate: 4,
  onsetBurst: 0,
};
