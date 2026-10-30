// Outline geometry: flatten font paths to polygons, clean them up, and fit them
// back to cubic Béziers for export. Pure functions, no DOM.

import pc from './vendor/polygon-clipping.js';

const EPS = 1e-6;

/** Flatten opentype path commands into closed rings of [x, y]. `seg` is the target segment length (px). */
export function flattenCommands(cmds, seg = 1.5) {
  const rings = [];
  let ring = null;
  let x = 0, y = 0, sx = 0, sy = 0;
  const steps = (len) => Math.max(2, Math.min(96, Math.ceil(len / seg)));
  for (const c of cmds) {
    if (c.type === 'M') {
      if (ring && ring.length > 2) rings.push(ring);
      ring = [[c.x, c.y]];
      x = sx = c.x; y = sy = c.y;
    } else if (c.type === 'L') {
      ring.push([c.x, c.y]);
      x = c.x; y = c.y;
    } else if (c.type === 'Q') {
      const n = steps(Math.hypot(c.x1 - x, c.y1 - y) + Math.hypot(c.x - c.x1, c.y - c.y1));
      for (let i = 1; i <= n; i++) {
        const t = i / n, mt = 1 - t;
        ring.push([mt * mt * x + 2 * mt * t * c.x1 + t * t * c.x, mt * mt * y + 2 * mt * t * c.y1 + t * t * c.y]);
      }
      x = c.x; y = c.y;
    } else if (c.type === 'C') {
      const n = steps(Math.hypot(c.x1 - x, c.y1 - y) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2));
      for (let i = 1; i <= n; i++) {
        const t = i / n, mt = 1 - t;
        const a = mt * mt * mt, b = 3 * mt * mt * t, d = 3 * mt * t * t, e = t * t * t;
        ring.push([a * x + b * c.x1 + d * c.x2 + e * c.x, a * y + b * c.y1 + d * c.y2 + e * c.y]);
      }
      x = c.x; y = c.y;
    } else if (c.type === 'Z') {
      if (ring && ring.length > 2) rings.push(ring);
      ring = null;
      x = sx; y = sy;
    }
  }
  if (ring && ring.length > 2) rings.push(ring);
  return rings.map(dedupe).filter((r) => r.length > 2);
}

/** Drop consecutive duplicates and the closing duplicate of the first point. */
export function dedupe(ring, eps = 1e-3) {
  const out = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.abs(p[0] - q[0]) > eps || Math.abs(p[1] - q[1]) > eps) out.push(p);
  }
  while (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps) out.pop(); else break;
  }
  return out;
}

export function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2;
}

export function bboxOfRings(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export const bboxOverlap = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** Insert points so that no segment is longer than `maxSeg` (needed before non-linear warps). */
export function densify(ring, maxSeg) {
  const out = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    out.push(a);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.ceil(len / maxSeg);
    for (let j = 1; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  return out;
}

const closeRing = (r) => [...r, r[0]];
const openRing = (r) => r.slice(0, -1);

/** MultiPolygon (polygon-clipping format, closed rings) → list of open rings. */
export function multiToRings(mp) {
  const out = [];
  for (const poly of mp) for (const ring of poly) {
    const r = dedupe(openRing(ring));
    if (r.length > 2) out.push(r);
  }
  return out;
}

export function mapMulti(mp, fn) {
  return mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => fn(x, y))));
}

export function densifyMulti(mp, maxSeg) {
  return mp.map((poly) => poly.map((ring) => closeRing(densify(openRing(ring), maxSeg))));
}

/**
 * Glyph rings (font winding) → MultiPolygon. Contours wound like the largest one are
 * fills, the others are holes; this follows the non-zero rule fonts are drawn with.
 */
export function ringsToMulti(rings) {
  if (!rings.length) return [];
  let main = rings[0];
  for (const r of rings) if (Math.abs(signedArea(r)) > Math.abs(signedArea(main))) main = r;
  const s = Math.sign(signedArea(main));
  const fills = [], holes = [];
  for (const r of rings) {
    if (Math.abs(signedArea(r)) < EPS) continue;
    (Math.sign(signedArea(r)) === s ? fills : holes).push([closeRing(r)]);
  }
  if (!fills.length) return [];
  const filled = pc.union(...fills);
  return holes.length ? pc.difference(filled, ...holes) : filled;
}

/** Make outer rings wind with sign `outerSign` and holes against it (consistent non-zero output). */
export function orientMulti(mp, outerSign) {
  return mp.map((poly) => poly.map((ring, i) => {
    const want = i === 0 ? outerSign : -outerSign;
    return Math.sign(signedArea(ring)) === want ? ring : [...ring].reverse();
  }));
}

// ---- Bézier fitting (Schneider, "An Algorithm for Automatically Fitting Digitized Curves") ----

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

function bez(b, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, c = 3 * mt * mt * t, d = 3 * mt * t * t, e = t * t * t;
  return [a * b[0][0] + c * b[1][0] + d * b[2][0] + e * b[3][0], a * b[0][1] + c * b[1][1] + d * b[2][1] + e * b[3][1]];
}
function bezD1(b, t) {
  const mt = 1 - t;
  return add(add(mul(sub(b[1], b[0]), 3 * mt * mt), mul(sub(b[2], b[1]), 6 * mt * t)), mul(sub(b[3], b[2]), 3 * t * t));
}
function bezD2(b, t) {
  return add(mul(add(sub(b[2], mul(b[1], 2)), b[0]), 6 * (1 - t)), mul(add(sub(b[3], mul(b[2], 2)), b[1]), 6 * t));
}

function chordParams(pts) {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = u[u.length - 1] || 1;
  return u.map((v) => v / L);
}

function generateBezier(pts, u, t1, t2) {
  const p0 = pts[0], p3 = pts[pts.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i], mt = 1 - t;
    const b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t;
    const a1 = mul(t1, b1), a2 = mul(t2, b2);
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
    const tmp = sub(pts[i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, tmp); x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let al = 0, ar = 0;
  if (Math.abs(det) > 1e-12) { al = (x0 * c11 - x1 * c01) / det; ar = (c00 * x1 - c01 * x0) / det; }
  const seg = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  if (al < seg * 1e-6 || ar < seg * 1e-6 || !Number.isFinite(al) || !Number.isFinite(ar)) al = ar = seg / 3;
  return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3];
}

function maxError(pts, b, u) {
  let max = 0, at = pts.length >> 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = bez(b, u[i]);
    const d = (p[0] - pts[i][0]) ** 2 + (p[1] - pts[i][1]) ** 2;
    if (d > max) { max = d; at = i; }
  }
  return [max, at];
}

function reparam(pts, b, u) {
  return u.map((t, i) => {
    const d = sub(bez(b, t), pts[i]);
    const d1 = bezD1(b, t), d2 = bezD2(b, t);
    const den = dot(d1, d1) + dot(d, d2);
    const nt = Math.abs(den) < 1e-12 ? t : t - dot(d, d1) / den;
    return Math.min(1, Math.max(0, nt));
  });
}

function fitCubic(pts, t1, t2, err2, out, depth = 0) {
  if (pts.length === 2) {
    const d = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / 3;
    out.push([pts[0], add(pts[0], mul(t1, d)), add(pts[1], mul(t2, d)), pts[1]]);
    return;
  }
  let u = chordParams(pts);
  let b = generateBezier(pts, u, t1, t2);
  let [e, split] = maxError(pts, b, u);
  if (e < err2) { out.push(b); return; }
  if (e < err2 * 16) {
    for (let k = 0; k < 6; k++) {
      u = reparam(pts, b, u);
      b = generateBezier(pts, u, t1, t2);
      [e, split] = maxError(pts, b, u);
      if (e < err2) { out.push(b); return; }
    }
  }
  if (depth > 24) { out.push(b); return; }
  const tc = norm(sub(pts[split - 1], pts[split + 1]));
  fitCubic(pts.slice(0, split + 1), t1, tc, err2, out, depth + 1);
  fitCubic(pts.slice(split), mul(tc, -1), t2, err2, out, depth + 1);
}

/** Indices of corner vertices (turn sharper than `angle` radians). */
function corners(ring, angle) {
  const n = ring.length;
  const out = [];
  const cos = Math.cos(angle);
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n], b = ring[i], c = ring[(i + 1) % n];
    const d1 = norm(sub(b, a)), d2 = norm(sub(c, b));
    if (dot(d1, d2) < cos) out.push(i);
  }
  return out;
}

/**
 * Fit a closed polyline with cubic Béziers within `tol` px; corners stay sharp.
 * Returns SVG path data for the ring ("M … C … Z").
 */
export function fitRingToD(ring, tol = 0.2, cornerAngle = (35 * Math.PI) / 180, fmt = num) {
  const n = ring.length;
  if (n < 3) return '';
  const cs = corners(ring, cornerAngle);
  const curves = [];
  const err2 = tol * tol;
  const tangentAt = (i) => norm(sub(ring[(i + 1) % n], ring[(i - 1 + n) % n]));
  if (!cs.length) {
    // Smooth closed contour: start anywhere with a shared tangent, so the join is C1.
    const pts = [...ring, ring[0]];
    const t = tangentAt(0);
    fitCubic(pts, t, mul(t, -1), err2, curves);
  } else {
    for (let k = 0; k < cs.length; k++) {
      const i0 = cs[k];
      const i1 = cs[(k + 1) % cs.length];
      const pts = [];
      for (let i = i0; ; i = (i + 1) % n) {
        pts.push(ring[i]);
        if (i === i1 && pts.length > 1) break;
        if (pts.length > n + 1) break;
      }
      if (pts.length < 2) continue;
      const t1 = norm(sub(pts[1], pts[0]));
      const t2 = norm(sub(pts[pts.length - 2], pts[pts.length - 1]));
      if (isStraight(pts, tol)) { curves.push(['L', pts[pts.length - 1]]); continue; }
      fitCubic(pts, t1, t2, err2, curves);
    }
  }
  const start = cs.length ? ring[cs[0]] : ring[0];
  let d = `M${fmt(start[0])} ${fmt(start[1])}`;
  for (const c of curves) {
    if (c[0] === 'L') d += `L${fmt(c[1][0])} ${fmt(c[1][1])}`;
    else d += `C${fmt(c[1][0])} ${fmt(c[1][1])} ${fmt(c[2][0])} ${fmt(c[2][1])} ${fmt(c[3][0])} ${fmt(c[3][1])}`;
  }
  return `${d}Z`;
}

function isStraight(pts, tol = 0.05) {
  const a = pts[0], b = pts[pts.length - 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < EPS) return true;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dist = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
    if (dist > tol) return false;
  }
  return true;
}

/** Number formatting for path data: 2 decimals, no trailing zeros. */
export function num(v) {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

export function ringToPolylineD(ring, fmt = num) {
  return `M${ring.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`;
}

/** Opentype commands → SVG path data, unchanged curves. */
export function commandsToD(cmds, fmt = num) {
  let d = '';
  for (const c of cmds) {
    if (c.type === 'M') d += `M${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.type === 'L') d += `L${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.type === 'Q') d += `Q${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.type === 'C') d += `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

export { pc };
