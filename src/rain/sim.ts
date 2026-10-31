// Rain on glass: a small, deterministic simulation of drops on a window pane.
// Ported 1:1 from the approved prototype (research/rain/glass-sim.html, v9). The order of random
// draws is part of the behaviour: keep it when editing, or the equivalence test will fail.
// No DOM; renderers live in render.ts.

import { cbrt, exp, hypot, pow } from './pmath.ts';

export interface RainOptions {
  width: number;
  height: number;
  seed?: number;
  /** Below this radius drops stay pinned; above it gravity wins (px). */
  criticalRadius?: number;
  /** px/s² */
  gravity?: number;
  /** Seconds for a trail to dry. */
  dryTime?: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  /** Width at the moment it was laid down. */
  w: number;
  t: number;
}

export interface Trail {
  pts: TrailPoint[];
  /** False once the drop that laid it has merged away or left the glass. */
  alive: boolean;
}

export interface Drop {
  id: number;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  /** Seconds left of a brief catch on a rough spot. */
  stop: number;
  moving: boolean;
  travel: number;
  nextBead: number;
  trail: Trail | null;
  /** Shape of a resting drop: aspect and rotation (resting drops are not perfect circles). */
  ax: number;
  rot: number;
  /** Trembling after nearby impacts: amplitude and phase. */
  shake: number;
  ph: number;
  /** Radius at which friction stopped it; 0 when not parked. */
  parkedAt: number;
  /** How much drizzle this drop catches (random per drop). */
  feed?: number;
}

export interface Impact {
  x: number;
  y: number;
  r: number;
  age: number;
}

const CELL = 24;
const WG = 4;
const vol = (r: number) => r * r * r;
const rad = (v: number) => cbrt(Math.max(v, 0));

export class RainSim {
  readonly width: number;
  readonly height: number;
  readonly criticalRadius: number;
  readonly gravity: number;
  readonly dryTime: number;
  readonly drops: Drop[] = [];
  readonly trails: Trail[] = [];
  readonly impacts: Impact[] = [];
  private seed: number;
  private nextId = 0;
  private readonly noise: number[];
  private readonly noiseW: number;
  private readonly wet: Float32Array;

  constructor(opts: RainOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.seed = opts.seed ?? 11;
    this.criticalRadius = opts.criticalRadius ?? 6.2;
    this.gravity = opts.gravity ?? 900;
    this.dryTime = opts.dryTime ?? 7;
    // glass imperfections: smooth value noise; high = more resistance (pinning sites)
    this.noiseW = this.width / 8 + 2;
    this.noise = Array.from({ length: this.noiseW * (this.height / 8 + 2) }, () => this.rnd());
    // wetness left by trails: wet paths have less resistance, so later drops follow them
    this.wet = new Float32Array((this.width / WG) * (this.height / WG));
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private surf(x: number, y: number): number {
    const gx = x / 8,
      gy = y / 8,
      i = Math.floor(gx),
      j = Math.floor(gy),
      fx = gx - i,
      fy = gy - j,
      w = this.noiseW;
    const n = this.noise;
    const a = n[j * w + i] ?? 0,
      b = n[j * w + i + 1] ?? 0,
      c = n[(j + 1) * w + i] ?? 0,
      d = n[(j + 1) * w + i + 1] ?? 0;
    const sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  }

  private wetAt(x: number, y: number): number {
    const i = Math.floor(x / WG),
      j = Math.floor(y / WG),
      cols = this.width / WG;
    return i < 0 || j < 0 || i >= cols || j >= this.height / WG ? 0 : this.wet[j * cols + i];
  }

  private addDrop(x: number, y: number, r: number): Drop {
    // property order = order of random draws
    const nextBead = 14 + this.rnd() * 20,
      ax = 0.75 + this.rnd() * 0.5,
      rot = this.rnd() * 3,
      ph = this.rnd() * 6;
    const d: Drop = {
      id: this.nextId++,
      x,
      y,
      r,
      vx: 0,
      vy: 0,
      stop: 0,
      moving: false,
      travel: 0,
      nextBead,
      trail: null,
      ax,
      rot,
      shake: 0,
      ph,
      parkedAt: 0,
    };
    this.drops.push(d);
    return d;
  }

  /** Advances the glass by dt seconds at rain intensity 0–1; t is the time after this step. */
  step(dt: number, intensity: number, t: number): void {
    const {
      width: W,
      height: H,
      criticalRadius: RC,
      gravity: G,
      dryTime: DRY,
      drops,
      trails,
      impacts,
    } = this;

    // rain lands: mostly tiny, sometimes bigger impacts
    let n = intensity * 7 * dt * 30;
    while (n > 0) {
      if (this.rnd() < n) {
        const x = this.rnd() * W,
          y = this.rnd() * H,
          r = 0.7 + pow(this.rnd(), 3.2) * (3 + intensity * 4);
        this.addDrop(x, y, r);
        impacts.push({ x, y, r, age: 0 });
      }
      n -= 1;
    }
    // drizzle feeds resting drops in proportion to their area (each drop catches what falls on it)
    for (const d of drops)
      if (!d.moving) {
        d.feed ??= 0.5 + this.rnd();
        d.r = rad(vol(d.r) + intensity * 0.65 * d.feed * d.r * d.r * dt);
      }
    let m = intensity * 6 * dt * 30;
    while (m > 0) {
      if (this.rnd() < m) this.addDrop(this.rnd() * W, this.rnd() * H, 0.5 + this.rnd() * 0.4);
      m -= 1;
    }
    // impacts make nearby resting drops tremble
    for (const im of impacts)
      if (im.age === 0)
        for (const d of drops) {
          const dd = hypot(d.x - im.x, d.y - im.y);
          if (dd < im.r * 9 && !d.moving)
            d.shake = Math.min(1.6, d.shake + (im.r * 2.2) / (1 + dd / 6));
        }
    for (let i = impacts.length - 1; i >= 0; i--)
      if ((impacts[i].age += dt) > 0.25) impacts.splice(i, 1);

    for (const d of drops) {
      d.shake *= exp(-dt * 7);
      d.ph += dt * 38;
      if (d.r <= RC) {
        d.moving = false;
        d.vy = 0;
        continue;
      }
      const resist =
        this.surf(d.x, d.y + d.r) * 1.6 - Math.min(1, this.wetAt(d.x, d.y + d.r) * 1.5);
      // parked: friction won; it waits until it has grown again
      if (d.parkedAt) {
        if (d.r < d.parkedAt * 1.06) {
          d.moving = false;
          d.vy = 0;
          continue;
        }
        d.parkedAt = 0;
      }
      if (d.moving && d.vy < 6 && d.r < RC * (1 + Math.max(0, resist) * 0.22)) {
        d.parkedAt = d.r;
        d.vy = 0;
        d.moving = false;
        continue;
      }
      if (d.stop > 0) {
        d.stop -= dt;
        d.vy *= 0.4;
      } else {
        d.vy += G * dt * Math.max(0, 1 - pow(RC / d.r, 2) * (0.6 + Math.max(0, resist))); // excess of gravity over adhesion
        d.vy = Math.min(d.vy * 0.965, 40 + d.r * 22); // drag
        if (resist > 0.75 && this.rnd() < 0.05) d.stop = 0.05 + this.rnd() * 0.35; // caught on a rough spot
      }
      // sideways: pushed off rough spots, pulled into wet paths, plus a little wander
      const e = d.r * 1.5;
      const grad = this.surf(d.x + e, d.y + d.r) - this.surf(d.x - e, d.y + d.r);
      const pull = this.wetAt(d.x + e * 2, d.y + d.r * 2) - this.wetAt(d.x - e * 2, d.y + d.r * 2);
      d.vx += (-grad * 260 + pull * 420 + (this.rnd() - 0.5) * 50) * dt;
      d.vx *= 0.88;
      const dy = d.vy * dt,
        dx = d.vx * dt * Math.min(1, d.vy / 30 + 0.2);
      d.x += dx;
      d.y += dy;
      d.moving = dy > 0.05;
      if (d.moving) {
        if (!d.trail) {
          d.trail = { pts: [], alive: true };
          trails.push(d.trail);
        }
        // width changes at a limited rate, so merges don't leave wedges in the trail
        const last = d.trail.pts[d.trail.pts.length - 1],
          target = d.r * 0.82;
        const w = last ? last.w + Math.max(-0.35, Math.min(0.2, target - last.w)) : target;
        d.trail.pts.push({ x: d.x, y: d.y - d.r * 0.2, w, t });
        const i = Math.floor(d.x / WG),
          j = Math.floor(d.y / WG),
          cols = W / WG;
        for (let k = -1; k <= 1; k++)
          if (i + k >= 0 && i + k < cols && j >= 0 && j < H / WG) this.wet[j * cols + i + k] = 1;
        d.travel += hypot(dx, dy);
        // the film left behind breaks into beads; the drop pays for them
        if (d.travel > d.nextBead) {
          d.travel = 0;
          d.nextBead = 10 + this.rnd() * 26;
          const br = 0.8 + this.rnd() * 1.5;
          this.addDrop(d.x + (this.rnd() - 0.5) * d.r * 0.4, d.y - d.r * 2.2, br);
          d.r = rad(vol(d.r) - vol(br) * 0.9);
        }
      }
    }

    // snap: a sliding drop pulls resting droplets in from about twice contact distance
    const key = (x: number, y: number) => (Math.floor(x / CELL) << 16) ^ Math.floor(y / CELL);
    const grid0 = new Map<number, Drop[]>();
    for (const d of drops) {
      const k = key(d.x, d.y);
      (grid0.get(k) || grid0.set(k, []).get(k)!).push(d);
    }
    for (const a of drops) {
      if (!a.moving) continue;
      const cx = Math.floor(a.x / CELL),
        cy = Math.floor(a.y / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++)
        for (let gy = cy - 1; gy <= cy + 2; gy++)
          for (const b of grid0.get((gx << 16) ^ gy) || []) {
            if (b === a || b.moving || b.r > a.r) continue;
            if (hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 1.9) {
              b.x += (a.x - b.x) * 0.45;
              b.y += (a.y - b.y) * 0.45;
            }
          }
    }
    // coalescence: volume is conserved
    const grid = new Map<number, Drop[]>();
    for (const d of drops) {
      const k = key(d.x, d.y);
      (grid.get(k) || grid.set(k, []).get(k)!).push(d);
    }
    const dead = new Set<Drop>();
    for (const a of drops) {
      if (dead.has(a)) continue;
      const cx = Math.floor(a.x / CELL),
        cy = Math.floor(a.y / CELL),
        reach = Math.ceil((a.r + 12) / CELL);
      for (let gx = cx - reach; gx <= cx + reach; gx++)
        for (let gy = cy - reach; gy <= cy + reach; gy++) {
          const cell = grid.get((gx << 16) ^ gy);
          if (!cell) continue;
          for (const b of cell) {
            if (b === a || dead.has(b) || dead.has(a)) continue;
            if (hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.85) {
              const [big, small] = vol(a.r) >= vol(b.r) ? [a, b] : [b, a];
              const vb = vol(big.r),
                vs = vol(small.r),
                v = vb + vs;
              big.x = (big.x * vb + small.x * vs) / v;
              big.y = (big.y * vb + small.y * vs) / v;
              big.r = rad(v);
              big.vy = (big.vy * vb + small.vy * vs) / v;
              if (small.trail) small.trail.alive = false;
              dead.add(small);
            }
          }
        }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (dead.has(d) || d.y - d.r > H) {
        if (d.trail) d.trail.alive = false;
        drops.splice(i, 1);
      }
    }
    // trails dry from the tail
    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i];
      while (tr.pts.length && t - tr.pts[0].t > DRY) tr.pts.shift();
      if (!tr.pts.length && !tr.alive) trails.splice(i, 1);
    }
    for (let i = 0; i < this.wet.length; i++) this.wet[i] *= 1 - dt / DRY;
  }

  /** Width along a trail: just under the drop at the head, tapering to a hairline toward the old end. */
  trailWidth(tr: Trail, k: number, t: number): number {
    const p = tr.pts[k],
      age = (t - p.t) / this.dryTime,
      s = k / Math.max(1, tr.pts.length - 1);
    return p.w * (0.08 + 0.92 * pow(s, 2.2)) * pow(1 - age, 0.7);
  }
}
