// Apply the rain (drops + trails at a moment in time) to laid-out glyph outlines.
// Glyphs the rain does not touch keep their original font curves.

import {
  pc, bboxOverlap, densifyMulti, mapMulti, multiToRings, orientMulti, fitRingToD,
  ringToPolylineD, commandsToD,
} from './geometry.js';
import { glyphPoly } from './font.js';
import { dropShape, lensProfile, magnificationFor, ellipsePolygon, dropMapper, trailWarper } from './lens.js';

const MIN_AREA = 0.05; // px²; slivers smaller than this are dropped

function safe(op, ...args) {
  try { return op(...args); } catch { return null; }
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2);
}

/**
 * @param layout  result of layoutText, glyph coordinates already offset into the artboard
 * @param sim     RainSim at the desired time
 * @param p       parameters
 * @returns { paths: [{ d, touched }], stats }
 */
export function compose(layout, sim, p) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const H = layout.H;
  const seg = Math.max(0.4, p.flatten);

  // Drops, in stacking order: resting first, moving drops on top.
  const drops = [...sim.drops].sort((a, b) => (a.state === 'rest' ? 0 : 1) - (b.state === 'rest' ? 0 : 1));
  const lenses = drops.map((d) => {
    const shape = dropShape(d, H);
    const m = magnificationFor((d.r * 2) / H, p);
    const prof = lensProfile(m, p.edgeFalloff, p.edgeGain);
    const k = prof.vmax;
    return {
      shape,
      disc: ellipsePolygon(shape.cx, shape.cy, shape.rx, shape.ry),
      src: ellipsePolygon(shape.cx, shape.cy, shape.rx * k, shape.ry * k),
      discBox: { x0: shape.cx - shape.rx, x1: shape.cx + shape.rx, y0: shape.cy - shape.ry, y1: shape.cy + shape.ry },
      srcBox: { x0: shape.cx - shape.rx * k, x1: shape.cx + shape.rx * k, y0: shape.cy - shape.ry * k, y1: shape.cy + shape.ry * k },
      map: dropMapper(shape, prof, p.flip),
      m,
      pieces: [],
    };
  });

  const trails = trailWarper(sim.trails, p, sim.time);
  const paths = [];
  let touchedCount = 0;
  let failures = 0;

  for (const g of layout.glyphs) {
    const hitTrail = trails.bands.some((b) => bboxOverlap(b, g.bbox));
    const hitDrops = lenses.filter((l) => bboxOverlap(l.discBox, g.bbox) || bboxOverlap(l.srcBox, g.bbox));
    if (!hitTrail && !hitDrops.length) {
      paths.push({ d: commandsToD(g.cmds), touched: false });
      continue;
    }
    touchedCount++;
    let poly = glyphPoly(g);
    if (hitTrail) poly = mapMulti(densifyMulti(poly, seg * 2), trails.warp);

    // What the drops show: the (wet) outline under each source ellipse, mapped into the drop.
    for (const l of hitDrops) {
      if (!bboxOverlap(l.srcBox, g.bbox)) continue;
      const inside = safe(pc.intersection, poly, l.src);
      if (inside === null) { failures++; continue; }
      if (inside.length) l.pieces.push(mapMulti(densifyMulti(inside, seg / l.m), l.map));
    }
    // What stays dry: the outline outside every drop footprint.
    const discs = hitDrops.filter((l) => bboxOverlap(l.discBox, g.bbox)).map((l) => l.disc);
    let base = poly;
    if (discs.length) {
      const cut = safe(pc.difference, poly, ...discs);
      if (cut === null) failures++; else base = cut;
    }
    paths.push({ rings: base, touched: true });
  }

  // A drop's content is hidden where a later (higher) drop covers it.
  lenses.forEach((l, i) => {
    if (!l.pieces.length) return;
    const above = lenses.slice(i + 1).filter((o) => bboxOverlap(o.discBox, l.discBox)).map((o) => o.disc);
    for (let piece of l.pieces) {
      if (above.length) {
        const cut = safe(pc.difference, piece, ...above);
        if (cut === null) { failures++; continue; }
        piece = cut;
      }
      paths.push({ rings: piece, touched: true });
    }
  });

  // Touched outlines → oriented, cleaned rings → fitted curves (or polylines).
  let nodes = 0;
  const out = [];
  for (const item of paths) {
    if (!item.touched) { out.push(item); nodes += (item.d.match(/[MLQCZ]/g) || []).length; continue; }
    const rings = multiToRings(orientMulti(item.rings, layout.outerSign)).filter((r) => ringArea(r) > MIN_AREA);
    if (!rings.length) continue;
    const d = rings.map((r) => (p.curves === 'polyline' ? ringToPolylineD(r) : fitRingToD(r, p.fitTolerance))).join('');
    nodes += (d.match(/[MLCZ]/g) || []).length;
    out.push({ d, touched: true });
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    paths: out,
    lenses: lenses.map((l) => l.shape),
    stats: { glyphs: layout.glyphs.length, touched: touchedCount, drops: lenses.length, trails: trails.bands.length, nodes, failures, ms: t1 - t0 },
  };
}

