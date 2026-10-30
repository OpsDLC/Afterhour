// Every adjustable value in the tool. The sidebar is generated from this schema.
// Rain sizes are diameters in letter heights (H = cap height of the set type), so the
// rain scales with the type. Rain defaults follow the Creative Director tuning spec.

export const schema = [
  // Type
  { key: 'size', group: 'Type', label: 'Size (px)', min: 24, max: 600, step: 1, value: 220 },
  { key: 'lineHeight', group: 'Type', label: 'Line height', min: 0.7, max: 2, step: 0.01, value: 1.05 },
  { key: 'tracking', group: 'Type', label: 'Tracking (‰ em)', min: -100, max: 300, step: 1, value: 0 },
  { key: 'align', group: 'Type', label: 'Align', type: 'select', options: ['left', 'center', 'right'], value: 'center' },
  { key: 'padding', group: 'Type', label: 'Margin (× H)', min: 0, max: 3, step: 0.05, value: 0.6 },

  // Rain
  { key: 'seed', group: 'Rain', label: 'Seed', type: 'seed', value: 2026 },
  { key: 'time', group: 'Rain', label: 'Time (s)', min: 0, max: 60, step: 0.05, value: 8 },
  { key: 'spawnRate', group: 'Rain', label: 'Drops / second', min: 0, max: 40, step: 0.5, value: 6 },
  { key: 'textBias', group: 'Rain', label: 'Aim at glyphs', min: 0, max: 1, step: 0.05, value: 0.8 },
  { key: 'introCoverage', group: 'Rain', label: 'Cover limit, first 5 s', min: 0.05, max: 1, step: 0.01, value: 0.25 },
  { key: 'maxCoverage', group: 'Rain', label: 'Cover limit, after', min: 0.05, max: 1, step: 0.01, value: 0.4 },
  { key: 'evaporation', group: 'Rain', label: 'Evaporation (H/min)', min: 0, max: 0.5, step: 0.01, value: 0.04 },

  // Drop sizes (diameter, H)
  { key: 'smallShare', group: 'Drop size', label: 'Small share', min: 0, max: 1, step: 0.05, value: 0.7 },
  { key: 'largeShare', group: 'Drop size', label: 'Large share', min: 0, max: 0.5, step: 0.01, value: 0.05 },
  { key: 'smallMin', group: 'Drop size', label: 'Small min (H)', min: 0.05, max: 1, step: 0.05, value: 0.3 },
  { key: 'smallMax', group: 'Drop size', label: 'Small max (H)', min: 0.05, max: 1, step: 0.05, value: 0.6 },
  { key: 'mediumMin', group: 'Drop size', label: 'Medium min (H)', min: 0.3, max: 2, step: 0.05, value: 0.8 },
  { key: 'mediumMax', group: 'Drop size', label: 'Medium max (H)', min: 0.3, max: 2, step: 0.05, value: 1.2 },
  { key: 'largeMax', group: 'Drop size', label: 'Large max (H)', min: 0.5, max: 3, step: 0.05, value: 1.8 },
  { key: 'sizeScale', group: 'Drop size', label: 'Scale ×', min: 0.25, max: 3, step: 0.05, value: 1 },

  // Lens
  { key: 'magSmall', group: 'Lens', label: 'Magnify small', min: 1, max: 3, step: 0.05, value: 1.3 },
  { key: 'magMedium', group: 'Lens', label: 'Magnify medium', min: 1, max: 3, step: 0.05, value: 1.6 },
  { key: 'magLarge', group: 'Lens', label: 'Magnify large', min: 1, max: 4, step: 0.05, value: 2.0 },
  { key: 'flip', group: 'Lens', label: 'Invert (real drop)', type: 'bool', value: true },
  { key: 'edgeFalloff', group: 'Lens', label: 'Edge falloff', min: 0, max: 0.5, step: 0.01, value: 0.15 },
  { key: 'edgeGain', group: 'Lens', label: 'Edge compression', min: 0, max: 8, step: 0.1, value: 1 },

  // Merge & slide
  { key: 'merge', group: 'Slide', label: 'Merge on touch', type: 'bool', value: true },
  { key: 'slideAt', group: 'Slide', label: 'Slides at (H)', min: 0.5, max: 3, step: 0.05, value: 1.3 },
  { key: 'creepSpeed', group: 'Slide', label: 'Creep (H/s)', min: 0, max: 1, step: 0.01, value: 0.1 },
  { key: 'creepTime', group: 'Slide', label: 'Creep time (s)', min: 0, max: 4, step: 0.05, value: 0.8 },
  { key: 'pauseTime', group: 'Slide', label: 'Pause (s)', min: 0, max: 2, step: 0.05, value: 0.3 },
  { key: 'slideMin', group: 'Slide', label: 'Speed min (H/s)', min: 0.5, max: 10, step: 0.1, value: 2 },
  { key: 'slideMax', group: 'Slide', label: 'Speed max (H/s)', min: 0.5, max: 15, step: 0.1, value: 4 },
  { key: 'slideSpeedScale', group: 'Slide', label: 'Speed ×', min: 0, max: 3, step: 0.05, value: 1 },
  { key: 'wander', group: 'Slide', label: 'Sideways wander', min: 0, max: 1, step: 0.01, value: 0.25 },
  { key: 'massLoss', group: 'Slide', label: 'Mass left per H', min: 0, max: 0.1, step: 0.002, value: 0.018 },
  { key: 'residue', group: 'Slide', label: 'Residue drops / H', min: 0, max: 1, step: 0.01, value: 0.12 },

  // Trail
  { key: 'trailWidth', group: 'Trail', label: 'Width (× diameter)', min: 0.05, max: 0.8, step: 0.01, value: 0.2 },
  { key: 'trailMag', group: 'Trail', label: 'Magnify', min: 1, max: 1.6, step: 0.01, value: 1.1 },
  { key: 'trailFade', group: 'Trail', label: 'Fade (s)', min: 0.5, max: 20, step: 0.1, value: 5 },

  // Output
  { key: 'curves', group: 'Output', label: 'Outlines', type: 'select', options: ['fitted', 'polyline'], value: 'fitted' },
  { key: 'fitTolerance', group: 'Output', label: 'Fit tolerance (px)', min: 0.05, max: 2, step: 0.05, value: 0.25 },
  { key: 'flatten', group: 'Output', label: 'Sampling (px)', min: 0.3, max: 4, step: 0.1, value: 1 },
  { key: 'ink', group: 'Output', label: 'Glyph colour', type: 'color', value: '#E8E4DC' },
  { key: 'paper', group: 'Output', label: 'Background', type: 'color', value: '#14161A' },
  { key: 'exportBackground', group: 'Output', label: 'Export background', type: 'bool', value: false },
];

/** Keys whose change requires re-running the rain from t = 0. */
export const simKeys = new Set(schema
  .filter((p) => ['Rain', 'Drop size', 'Slide', 'Trail'].includes(p.group) && p.key !== 'time')
  .map((p) => p.key)
  .concat(['size', 'lineHeight', 'tracking', 'align', 'padding']));

export function defaults() {
  const out = {};
  for (const p of schema) out[p.key] = p.value;
  return out;
}
