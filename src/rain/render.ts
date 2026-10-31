// Two looks for the same glass, ported 1:1 from the prototype (research/rain/glass-sim.html, v9).
// Both read a white-background, black-ink RGBA image of the type and write an RGBA image of the
// same size. No DOM: the caller owns canvases.
//   lens   – the glass refracts: drops are crisp lenses (big ones invert), trails are thin cylinders.
//   fusion – water that touches ink joins the ink; only the stretch right behind a sliding drop
//            still drags ink (tuning 1, approved 2026-10).
import { cos, hypot, pow, sin } from './pmath.ts';
import type { RainSim } from './sim.ts';

export interface Page {
  width: number;
  height: number;
  /** RGBA, white paper with black ink. */
  rgba: Uint8ClampedArray;
}

/** Ink coverage of a page, 0–1, plus the softened copy the fusion join is grown from. */
export interface InkMaps {
  ink: Float32Array;
  inkSoft: Float32Array;
}

export interface FusionOptions {
  /** Scale on the water's width. */
  width?: number;
  /** Length in px of trail behind each live drop that still joins the ink; Infinity = all of it. */
  trailHead?: number;
}

/** Approved tuning: only ~45 px of trail behind a sliding drop drags ink. */
export const FUSION_DEFAULTS: Required<FusionOptions> = { width: 1, trailHead: 45 };

/** Two-pass box blur in place (horizontal then vertical), clamped at the edges. */
function blur(a: Float32Array, W: number, H: number, R: number): Float32Array {
  const t = new Float32Array(a.length),
    n = 2 * R + 1;
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = -R; x <= R; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      t[y * W + x] = s / n;
      s += a[y * W + Math.min(W - 1, x + R + 1)] - a[y * W + Math.max(0, x - R)];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -R; y <= R; y++) s += t[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      a[y * W + x] = s / n;
      s += t[Math.min(H - 1, y + R + 1) * W + x] - t[Math.max(0, y - R) * W + x];
    }
  }
  return a;
}

export function inkMaps(page: Page): InkMaps {
  const { width: W, height: H, rgba } = page;
  const ink = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) ink[i] = 1 - rgba[i * 4] / 255;
  return { ink, inkSoft: blur(blur(ink.slice(), W, H, 2), W, H, 2) };
}

export function renderFusion(
  sim: RainSim,
  maps: InkMaps,
  t: number,
  out: Uint8ClampedArray,
  opt: FusionOptions = FUSION_DEFAULTS,
): void {
  const { width: W, height: H } = sim,
    { ink, inkSoft } = maps;
  const ws = opt.width ?? 1,
    head = opt.trailHead ?? Infinity;
  const wf = new Float32Array(W * H);
  const touches = (cx: number, cy: number, r: number) => {
    for (let y = -r; y <= r; y += 1.5)
      for (let x = -r; x <= r; x += 1.5) {
        const X = Math.round(cx + x),
          Y = Math.round(cy + y);
        if (X >= 0 && Y >= 0 && X < W && Y < H && x * x + y * y <= r * r && ink[Y * W + X] > 0.5)
          return true;
      }
    return false;
  };
  const stamp = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.floor(-ry); y <= ry; y++)
      for (let x = Math.floor(-rx); x <= rx; x++) {
        const X = Math.round(cx) + x,
          Y = Math.round(cy) + y;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const u = pow(x / rx, 2) + pow(y / ry, 2);
        if (u >= 1) continue;
        const v = 0.95 * (1 - u),
          i = Y * W + X;
        if (v > wf[i]) wf[i] = v;
      }
  };
  for (const tr of sim.trails) {
    if (head !== Infinity && !tr.alive) continue; // a trail whose drop is gone no longer drags ink
    const from: number[] = [];
    let along = 0;
    for (let k = tr.pts.length - 1; k > 0; k--) {
      from[k] = along;
      along += hypot(tr.pts[k].x - tr.pts[k - 1].x, tr.pts[k].y - tr.pts[k - 1].y);
    }
    for (let k = 1; k < tr.pts.length; k++) {
      if (from[k] > head) continue; // only the stretch right behind the drop
      const a = tr.pts[k - 1],
        b = tr.pts[k],
        wa = sim.trailWidth(tr, k - 1, t) * ws,
        wb = sim.trailWidth(tr, k, t) * ws;
      if (wb < 0.6) continue;
      if (!touches(b.x, b.y, wb + 1) && !touches(a.x, a.y, wa + 1)) continue;
      const n = Math.max(1, Math.ceil(hypot(b.x - a.x, b.y - a.y))); // fill the gap between samples
      for (let j = 0; j <= n; j++) {
        const f = j / n,
          x = a.x + (b.x - a.x) * f,
          y = a.y + (b.y - a.y) * f,
          w = wa + (wb - wa) * f;
        if (touches(x, y, w + 1)) stamp(x, y, w * 1.15, 2.5);
      }
    }
  }
  for (const d of sim.drops) {
    if (d.r < 1.2) continue;
    const ox = d.moving ? 0 : d.shake * sin(d.ph),
      oy = d.moving ? 0 : d.shake * 0.6 * cos(d.ph * 1.3);
    if (!touches(d.x + ox, d.y + oy, d.r)) continue;
    const r = d.r * ws;
    if (d.moving) {
      const up = 1 + Math.min(0.8, d.vy / 250);
      stamp(d.x, d.y, r * 1.15, r * 1.15);
      stamp(d.x, d.y - r * up * 0.7, r * 0.8, r * up);
    } else stamp(d.x + ox, d.y + oy, r * d.ax * 1.15, (r / d.ax) * 1.15);
  }
  // smooth union of ink and water, then a crisp edge
  for (let i = 0; i < W * H; i++) {
    const s = Math.max(ink[i], inkSoft[i] + wf[i]),
      a = Math.min(1, Math.max(0, (s - 0.42) / 0.16)),
      v = 255 * (1 - a);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
}

export function renderLens(sim: RainSim, page: Page, t: number, out: Uint8ClampedArray): void {
  const { width: W, height: H } = sim,
    sd = page.rgba;
  out.set(sd);
  // bilinear sample of the page
  const put = (k: number, sx: number, sy: number) => {
    sx = Math.max(0, Math.min(W - 2, sx));
    sy = Math.max(0, Math.min(H - 2, sy));
    const x0 = sx | 0,
      y0 = sy | 0,
      fx = sx - x0,
      fy = sy - y0,
      j = (y0 * W + x0) * 4;
    for (let ch = 0; ch < 3; ch++)
      out[k + ch] =
        (sd[j + ch] * (1 - fx) + sd[j + 4 + ch] * fx) * (1 - fy) +
        (sd[j + W * 4 + ch] * (1 - fx) + sd[j + W * 4 + 4 + ch] * fx) * fy;
    out[k + 3] = 255;
  };
  // trail film: a field of nearest trail centre + normalised distance, then one cylindrical lens per pixel
  const tu = new Float32Array(W * H).fill(1),
    tcx = new Float32Array(W * H);
  for (const tr of sim.trails)
    for (let k = 0; k < tr.pts.length; k++) {
      const p = tr.pts[k],
        w = sim.trailWidth(tr, k, t);
      if (w < 0.5) continue;
      for (let y = Math.floor(p.y - 1); y <= p.y + 1; y++)
        for (let x = Math.floor(p.x - w); x <= p.x + w; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = y * W + x,
            u = Math.abs(x - p.x) / w;
          if (u < tu[i]) {
            tu[i] = u;
            tcx[i] = p.x;
          }
        }
    }
  for (let i = 0; i < W * H; i++) {
    if (tu[i] >= 1) continue;
    const x = i % W,
      y = (i / W) | 0,
      dx = x - tcx[i];
    put(i * 4, tcx[i] + dx * (0.2 + 0.8 * tu[i] * tu[i]), y);
  }
  // drops: crisp-edged lenses; big ones invert; sliding ones stretch into teardrops
  for (const d of sim.drops) {
    if (d.r < 1.2) continue;
    const mag = 1.2 + Math.min(1, d.r / 14) * 0.9,
      flip = d.r > 4.5 ? -1 : 1,
      up = d.moving ? 1 + Math.min(0.8, d.vy / 250) : 1;
    const R = Math.ceil(d.r * up * 1.1) + 1;
    const sx0 = d.shake * sin(d.ph),
      sy0 = d.shake * 0.6 * cos(d.ph * 1.3);
    const cr = cos(d.rot),
      sr = sin(d.rot);
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const X = Math.round(d.x + sx0) + x,
          Y = Math.round(d.y + sy0) + y;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const yy = y < 0 ? y / up : y;
        const dist = d.moving
          ? hypot(x, yy) / d.r
          : hypot((x * cr + y * sr) / d.ax, (-x * sr + y * cr) * d.ax) / d.r;
        if (dist >= 1) continue;
        const s = (flip / mag) * (1 + 1.6 * pow(dist, 4));
        put((Y * W + X) * 4, d.x + x * s, d.y + yy * s);
      }
  }
}
