// Rain on a glyph, as point-compatible outlines (H4N-29).
// The glyph is rasterised, the rain-on-glass engine (H4N-35) runs over it, and at each master
// time the fused shape (ink ∪ water touching ink, the approved Fusion look) is read back as
// outlines: every outline point walks outward along its normal while it is still inside the
// fused shape. Points never move inward and never change in number, so all masters share one
// point structure and a variable font can interpolate between them (RAIN axis).
import { inkMaps, RainSim, renderFusion } from '../rain/index.ts';
import {
  bounds,
  crossings,
  rasterize,
  toPx,
  type Contour,
  type Frame,
  type Point,
  type SegRef,
} from './geometry.ts';

export interface RainGlyphOptions {
  /** Same seed → same rain (the engine is bit-for-bit deterministic). */
  seed: number;
  /** Seconds of rain for each master; the first is the dry glyph and must be 0. */
  times?: number[];
  /** Pixels per font unit for the simulation (0.3 ≈ the approved prototype's scale at 1000 upm). */
  scale?: number;
  /** Empty glass around the glyph, in font units. */
  margin?: number;
  /** Rain amount over time (0–1). */
  intensity?: (t: number) => number;
  /** Largest change of displacement between neighbouring points, per unit of outline length. */
  gradient?: number;
}

export interface RainedGlyph {
  /** masters[k][contour][point]; masters[0] is the dry glyph. */
  masters: Contour[][];
  /** Crossings left in each master that the dry glyph did not already have (0 when clean). */
  newCrossings: number[];
}

const DT = 1 / 30;

/** Outward unit normals, oriented per contour by looking at which side the ink is on. */
function outwardNormals(contours: Contour[], ink: Float32Array, f: Frame): Point[][] {
  return contours.map((c) => {
    const n = c.map((_, i): Point => {
      const a = c[(i - 1 + c.length) % c.length],
        b = c[(i + 1) % c.length];
      const nx = b[1] - a[1],
        ny = -(b[0] - a[0]);
      const l = Math.sqrt(nx * nx + ny * ny) || 1;
      return [nx / l, ny / l];
    });
    // vote: does stepping 1.5 px along +n land in ink? then +n points inward for this contour
    let inward = 0;
    const probe = 1.5 / f.scale;
    for (let i = 0; i < c.length; i++) {
      const [px, py] = toPx(f, c[i][0] + n[i][0] * probe, c[i][1] + n[i][1] * probe);
      const X = Math.floor(px),
        Y = Math.floor(py);
      if (X >= 0 && Y >= 0 && X < f.width && Y < f.height && ink[Y * f.width + X] > 0.5) inward++;
      else inward--;
    }
    return inward > 0 ? n.map(([x, y]): Point => [-x, -y]) : n;
  });
}

/** Distance along the ray to the nearest outline crossing (the medial-axis cap uses half of it). */
function rayHits(contours: Contour[], normals: Point[][]): number[][] {
  const segs: [Point, Point][] = [];
  for (const c of contours)
    for (let i = 0; i < c.length; i++) segs.push([c[i], c[(i + 1) % c.length]]);
  return contours.map((c, ci) =>
    c.map((p, i) => {
      const [nx, ny] = normals[ci][i];
      let best = Infinity;
      for (const [a, b] of segs) {
        const ex = b[0] - a[0],
          ey = b[1] - a[1];
        const den = nx * ey - ny * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
        const u = ((a[0] - p[0]) * ny - (a[1] - p[1]) * nx) / den;
        if (t > 1 && u >= 0 && u <= 1 && t < best) best = t;
      }
      return best;
    }),
  );
}

/** In-place [1 2 1]/4 smoothing around a closed contour (water edges are round; rays are noisy). */
function smooth(d: number[], passes: number): void {
  const n = d.length;
  for (let p = 0; p < passes; p++) {
    const prev = d.slice();
    for (let i = 0; i < n; i++)
      d[i] = (prev[(i - 1 + n) % n] + 2 * prev[i] + prev[(i + 1) % n]) / 4;
  }
}

/** Limits how fast displacement may change along each contour (both directions, wrapping). */
function limitGradient(d: number[], c: Contour, g: number): void {
  const n = c.length;
  const len = (i: number, j: number) =>
    Math.sqrt((c[j][0] - c[i][0]) ** 2 + (c[j][1] - c[i][1]) ** 2);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 1; k <= n; k++) {
      const i = k % n,
        j = (k - 1) % n;
      d[i] = Math.min(d[i], d[j] + g * len(i, j));
    }
    for (let k = n - 2; k >= -1; k--) {
      const i = (k + n) % n,
        j = (k + 1) % n;
      d[i] = Math.min(d[i], d[j] + g * len(i, j));
    }
  }
}

const place = (contours: Contour[], normals: Point[][], disp: number[][]): Contour[] =>
  contours.map((c, ci) =>
    c.map(([x, y], i): Point => [
      x + normals[ci][i][0] * disp[ci][i],
      y + normals[ci][i][1] * disp[ci][i],
    ]),
  );

const pairKey = ([r, s]: [SegRef, SegRef]) => `${r}|${s}`;

export function rainGlyph(contours: Contour[], opts: RainGlyphOptions): RainedGlyph {
  const times = opts.times ?? [0, 4, 8, 14];
  const scale = opts.scale ?? 0.3;
  const margin = opts.margin ?? 120;
  const intensity = opts.intensity ?? ((t: number) => Math.min(1, 0.3 + t / 8));
  const gradient = opts.gradient ?? 2.5;
  if (!contours.length) return { masters: times.map(() => []), newCrossings: times.map(() => 0) };

  const b = bounds(contours);
  const f: Frame = {
    scale,
    x0: b.minX - margin,
    y0: b.maxY + margin,
    width: Math.ceil((b.maxX - b.minX + 2 * margin) * scale),
    height: Math.ceil((b.maxY - b.minY + 2 * margin) * scale),
  };
  const page = { width: f.width, height: f.height, rgba: rasterize(contours, f) };
  const maps = inkMaps(page);
  const normals = outwardNormals(contours, maps.ink, f);
  const caps = rayHits(contours, normals).map((row) => row.map((h) => 0.45 * h));
  const baseCrossings = new Set(crossings(contours).map(pairKey));

  const sim = new RainSim({ width: f.width, height: f.height, seed: opts.seed });
  const fused = new Uint8ClampedArray(f.width * f.height * 4);
  const masters: Contour[][] = [contours];
  const newCrossings = [0];
  let t = 0;
  for (const target of times.slice(1)) {
    while (t < target - 1e-9) {
      t += DT;
      sim.step(DT, intensity(t), t);
    }
    renderFusion(sim, maps, t, fused);
    // the fused page is anti-aliased: read it bilinearly and find the 50% edge to sub-pixel precision
    const grey = (x: number, y: number) => {
      const [px, py] = toPx(f, x, y);
      const gx = px - 0.5,
        gy = py - 0.5;
      const X = Math.floor(gx),
        Y = Math.floor(gy);
      const fx = gx - X,
        fy = gy - Y;
      const at = (i: number, j: number) =>
        i < 0 || j < 0 || i >= f.width || j >= f.height ? 255 : fused[(j * f.width + i) * 4];
      return (
        (at(X, Y) * (1 - fx) + at(X + 1, Y) * fx) * (1 - fy) +
        (at(X, Y + 1) * (1 - fx) + at(X + 1, Y + 1) * fx) * fy
      );
    };
    const inside = (x: number, y: number) => grey(x, y) < 128;
    const march = 0.5 / scale; // half a pixel
    const disp = contours.map((c, ci) =>
      c.map(([x, y], i) => {
        const [nx, ny] = normals[ci][i];
        const cap = caps[ci][i];
        let d = 0;
        while (d + march <= cap && inside(x + nx * (d + march), y + ny * (d + march))) d += march;
        if (d + march > cap) return Math.min(d, cap);
        // bisect between the last point inside and the first outside
        let lo = d,
          hi = d + march;
        for (let k = 0; k < 8; k++) {
          const mid = (lo + hi) / 2;
          if (inside(x + nx * mid, y + ny * mid)) lo = mid;
          else hi = mid;
        }
        return lo;
      }),
    );
    // a light [1 2 1] smoothing along each contour: water edges are round, rays are noisy
    for (const d of disp) smooth(d, 2);
    contours.forEach((c, ci) => limitGradient(disp[ci], c, gradient));

    // where water from two strokes meets, pull back the points involved until nothing crosses
    let shape = place(contours, normals, disp);
    let left = crossings(shape).filter((p) => !baseCrossings.has(pairKey(p)));
    for (let round = 0; round < 24 && left.length; round++) {
      const factor = round < 12 ? 0.6 : 0;
      for (const pair of left)
        for (const [ci, si] of pair) {
          const n = contours[ci].length;
          for (let k = -3; k <= 4; k++) disp[ci][(si + k + n) % n] *= factor;
        }
      contours.forEach((c, ci) => limitGradient(disp[ci], c, gradient));
      shape = place(contours, normals, disp);
      left = crossings(shape).filter((p) => !baseCrossings.has(pairKey(p)));
    }
    masters.push(shape);
    newCrossings.push(left.length);
  }
  return { masters, newCrossings };
}

/** Deterministic per-glyph seed from the user seed, the character and the alternate index. */
export function glyphSeed(userSeed: number, codePoint: number, alternate = 0): number {
  let h = (userSeed ^ 0x9e3779b9) >>> 0;
  for (const v of [codePoint, alternate]) {
    h = Math.imul(h ^ v, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return (h % 2147483646) + 1; // the engine's LCG needs 1..2^31−2
}
