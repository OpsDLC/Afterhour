// Outline geometry for the rain font (H4N-29). Pure, no DOM; font units, y up.

export type Point = [number, number];
/** A closed polygon; the last point connects back to the first. */
export type Contour = Point[];

export interface PathCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);

/**
 * Turns glyph path commands into polygons sampled about every `step` units. Every master of a
 * rained glyph is derived from these points, so all masters are point-compatible by construction.
 */
export function flatten(commands: PathCommand[], step = 5): Contour[] {
  const out: Contour[] = [];
  let cur: Contour = [];
  let lx = 0,
    ly = 0;
  const push = (x: number, y: number) => {
    cur.push([x, y]);
    lx = x;
    ly = y;
  };
  const close = () => {
    if (cur.length > 1) {
      const [fx, fy] = cur[0];
      const [ex, ey] = cur[cur.length - 1];
      if (dist(fx, fy, ex, ey) < 1e-6) cur.pop();
    }
    if (cur.length >= 3) out.push(cur);
    cur = [];
  };
  // points at equal arc length along a curve (sampled densely first, then walked)
  const curve = (at: (t: number) => Point) => {
    const fine = 64;
    const pts: Point[] = [[lx, ly]];
    const acc = [0];
    for (let i = 1; i <= fine; i++) {
      const p = at(i / fine);
      acc.push(acc[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], p[0], p[1]));
      pts.push(p);
    }
    const total = acc[fine];
    const n = Math.max(1, Math.ceil(total / step));
    let j = 1;
    for (let k = 1; k < n; k++) {
      const target = (total * k) / n;
      while (acc[j] < target) j++;
      const f = (target - acc[j - 1]) / (acc[j] - acc[j - 1] || 1);
      push(
        pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f,
        pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f,
      );
    }
    push(pts[fine][0], pts[fine][1]);
  };
  for (const c of commands) {
    if (c.type === 'M') {
      close();
      push(c.x!, c.y!);
    } else if (c.type === 'L') {
      const n = Math.max(1, Math.ceil(dist(lx, ly, c.x!, c.y!) / step));
      const x0 = lx,
        y0 = ly;
      for (let i = 1; i <= n; i++) push(x0 + ((c.x! - x0) * i) / n, y0 + ((c.y! - y0) * i) / n);
    } else if (c.type === 'Q') {
      const x0 = lx,
        y0 = ly;
      curve((t) => {
        const a = (1 - t) * (1 - t),
          b = 2 * t * (1 - t),
          d = t * t;
        return [a * x0 + b * c.x1! + d * c.x!, a * y0 + b * c.y1! + d * c.y!];
      });
    } else if (c.type === 'C') {
      const x0 = lx,
        y0 = ly;
      curve((t) => {
        const u = 1 - t;
        const a = u * u * u,
          b = 3 * t * u * u,
          cc = 3 * t * t * u,
          d = t * t * t;
        return [
          a * x0 + b * c.x1! + cc * c.x2! + d * c.x!,
          a * y0 + b * c.y1! + cc * c.y2! + d * c.y!,
        ];
      });
    } else if (c.type === 'Z') close();
  }
  close();
  return out;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(contours: Contour[]): Box {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const c of contours)
    for (const [x, y] of c) {
      if (x < b.minX) b.minX = x;
      if (y < b.minY) b.minY = y;
      if (x > b.maxX) b.maxX = x;
      if (y > b.maxY) b.maxY = y;
    }
  return b;
}

/** Maps font units to a pixel grid (y down) and back. */
export interface Frame {
  scale: number; // px per unit
  x0: number; // font x at pixel 0
  y0: number; // font y at pixel row 0 (top)
  width: number;
  height: number;
}

export const toPx = (f: Frame, x: number, y: number): Point => [
  (x - f.x0) * f.scale,
  (f.y0 - y) * f.scale,
];

/** Non-zero fill of the contours into a white-paper / black-ink RGBA page (pixel-centre sampling). */
export function rasterize(contours: Contour[], f: Frame): Uint8ClampedArray {
  const { width: W, height: H } = f;
  const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
  const xs: [number, number][] = [];
  for (let py = 0; py < H; py++) {
    const y = f.y0 - (py + 0.5) / f.scale;
    xs.length = 0;
    for (const c of contours)
      for (let i = 0; i < c.length; i++) {
        const a = c[i],
          b = c[(i + 1) % c.length];
        if (a[1] <= y !== b[1] <= y)
          xs.push([a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), b[1] > a[1] ? 1 : -1]);
      }
    xs.sort((p, q) => p[0] - q[0]);
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k][1];
      if (wind === 0) continue;
      const from = Math.max(0, Math.ceil((xs[k][0] - f.x0) * f.scale - 0.5));
      const to = Math.min(W - 1, Math.floor((xs[k + 1][0] - f.x0) * f.scale - 0.5));
      for (let px = from; px <= to; px++) {
        const i = (py * W + px) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
      }
    }
  }
  return rgba;
}

/** Proper crossing of segments ab and cd (touching at endpoints does not count). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-12) return false;
  const u = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const v = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  const e = 1e-9;
  return u > e && u < 1 - e && v > e && v < 1 - e;
}

/** A segment: contour index and the index of its first point. */
export type SegRef = [number, number];

/** All crossing segment pairs across the glyph (spatial hash; adjacent segments skipped). */
export function crossings(contours: Contour[], cell = 24): [SegRef, SegRef][] {
  const grid = new Map<string, SegRef[]>();
  const seg = (r: SegRef): [Point, Point] => {
    const c = contours[r[0]];
    return [c[r[1]], c[(r[1] + 1) % c.length]];
  };
  contours.forEach((c, ci) => {
    for (let i = 0; i < c.length; i++) {
      const [a, b] = seg([ci, i]);
      const x0 = Math.floor(Math.min(a[0], b[0]) / cell),
        x1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const y0 = Math.floor(Math.min(a[1], b[1]) / cell),
        y1 = Math.floor(Math.max(a[1], b[1]) / cell);
      for (let gx = x0; gx <= x1; gx++)
        for (let gy = y0; gy <= y1; gy++) {
          const k = `${gx},${gy}`;
          (grid.get(k) ?? grid.set(k, []).get(k)!).push([ci, i]);
        }
    }
  });
  const seen = new Set<string>();
  const out: [SegRef, SegRef][] = [];
  for (const list of grid.values())
    for (let p = 0; p < list.length; p++)
      for (let q = p + 1; q < list.length; q++) {
        const r = list[p],
          s = list[q];
        if (r[0] === s[0]) {
          const n = contours[r[0]].length,
            d = Math.abs(r[1] - s[1]);
          if (d <= 1 || d === n - 1) continue; // neighbours share a point
        }
        const key = r[0] < s[0] || (r[0] === s[0] && r[1] < s[1]) ? `${r}|${s}` : `${s}|${r}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [a, b] = seg(r),
          [c, d] = seg(s);
        if (segmentsCross(a, b, c, d)) out.push([r, s]);
      }
  return out;
}
