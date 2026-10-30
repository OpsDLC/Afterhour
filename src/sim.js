// Rain simulation: droplets land, accumulate, merge, creep, pause and slide off,
// leaving fading wet trails. Deterministic for a given seed, DOM-free.
// Units are CSS pixels; behaviour is expressed in letter heights (H).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const INTRO_SECONDS = 5;
const MERGE_TOUCH = 0.92; // centre distance / (r1 + r2) at which drops coalesce
const STOP_RATIO = 0.55; // a sliding drop sticks again below this share of the slide size

export class RainSim {
  constructor({ rand = Math.random } = {}) {
    this.rand = rand;
    this.drops = [];
    this.trails = [];
    this.time = 0;
    this.nextId = 1;
    this.spawnAcc = 0;
    this.layout = { width: 1, height: 1, H: 20, textBox: { x: 0, y: 0, w: 1, h: 1 } };
  }

  setLayout(layout) {
    const old = this.layout;
    this.layout = layout;
    // Keep drops roughly where they were relative to the viewport on resize.
    if (old.width > 1 && (old.width !== layout.width || old.height !== layout.height)) {
      const sx = layout.width / old.width;
      const sy = layout.height / old.height;
      const sr = layout.H / old.H;
      for (const d of this.drops) { d.x *= sx; d.y *= sy; d.r *= sr; }
      for (const tr of this.trails) for (const p of tr.points) { p.x *= sx; p.y *= sy; p.w *= sr; }
    }
  }

  clear() {
    this.drops.length = 0;
    this.trails.length = 0;
    this.time = 0;
  }

  /** Total droplet area divided by the text block's area. */
  coverage() {
    let a = 0;
    for (const d of this.drops) a += Math.PI * d.r * d.r;
    const tb = this.layout.textBox;
    return a / Math.max(1, tb.w * tb.h);
  }

  /** Add a drop with diameter `diam` (px). Returns the drop. */
  addDrop(x, y, diam) {
    const d = {
      id: this.nextId++,
      x, y,
      r: diam / 2,
      vx: 0, vy: 0,
      state: 'rest',
      t: 0,
      target: 0,
      trail: null,
      born: this.time,
    };
    this.drops.push(d);
    return d;
  }

  /** Pick a diameter (px) from the small/medium/large distribution. */
  pickDiameter(p) {
    const H = this.layout.H;
    const u = this.rand();
    const v = this.rand();
    let dH;
    if (u < p.largeShare) dH = lerp(p.mediumMax, p.largeMax, v);
    else if (u < p.largeShare + p.smallShare) dH = lerp(p.smallMin, p.smallMax, v);
    else dH = lerp(p.mediumMin, p.mediumMax, v);
    return dH * H * p.sizeScale;
  }

  pickPosition(p) {
    const { width, height, textBox: tb, H } = this.layout;
    if (this.rand() < p.textBias) {
      const pad = H * 0.6;
      return [tb.x - pad + this.rand() * (tb.w + pad * 2), tb.y - pad + this.rand() * (tb.h + pad * 2)];
    }
    return [this.rand() * width, this.rand() * height];
  }

  spawn(p) {
    const cap = this.time < INTRO_SECONDS ? p.introCoverage : p.maxCoverage;
    let cov = this.coverage();
    const tb = this.layout.textBox;
    const textArea = Math.max(1, tb.w * tb.h);
    const tryAdd = (diam) => {
      const a = Math.PI * (diam / 2) ** 2;
      if (cov + a / textArea > cap) return;
      const [x, y] = this.pickPosition(p);
      this.addDrop(x, y, diam);
      cov += a / textArea;
    };

    this.spawnAcc += p.spawnRate * this.dt;
    while (this.spawnAcc >= 1) { this.spawnAcc -= 1; tryAdd(this.pickDiameter(p)); }
  }

  update(dt, p) {
    dt = Math.min(dt, 0.1); // never jump more than 100 ms (tab switches)
    this.dt = dt;
    this.time += dt;
    const { H, height } = this.layout;
    const slideDiam = p.slideAt * H;

    this.spawn(p);

    for (const d of this.drops) {
      const diam = d.r * 2;
      switch (d.state) {
        case 'rest': {
          d.r -= (p.evaporation * H / 60 / 2) * dt;
          if (diam >= slideDiam) { d.state = 'creep'; d.t = 0; }
          break;
        }
        case 'creep': {
          d.vy = p.creepSpeed * H;
          d.y += d.vy * dt;
          d.t += dt;
          if (d.t >= p.creepTime) { d.state = 'pause'; d.t = 0; d.vy = 0; }
          break;
        }
        case 'pause': {
          d.t += dt;
          if (d.t >= p.pauseTime) {
            d.state = 'slide';
            d.t = 0;
            d.target = lerp(p.slideMin, p.slideMax, this.rand()) * H;
            d.trail = { points: [], open: true };
            this.trails.push(d.trail);
            this.addTrailPoint(d, p);
          }
          break;
        }
        case 'slide': {
          this.slide(d, dt, p, slideDiam);
          break;
        }
      }
      if (d.y - d.r > height + 2 || d.r < 0.4) d.dead = true;
    }

    if (p.merge) this.mergeDrops();

    if (this.drops.some((d) => d.dead)) {
      for (const d of this.drops) if (d.dead && d.trail) d.trail.open = false;
      this.drops = this.drops.filter((d) => !d.dead);
    }

    this.updateTrails(p);

  }

  slide(d, dt, p, slideDiam) {
    const H = this.layout.H;
    d.t += dt;
    const sizeFactor = Math.sqrt(Math.max(0.3, (d.r * 2) / slideDiam));
    const target = d.target * p.slideSpeedScale * sizeFactor;
    d.vy += (target - d.vy) * Math.min(1, dt * 3);
    // Sideways wander: a damped random walk, bounded relative to fall speed.
    d.vx += (this.rand() - 0.5) * p.wander * H * 12 * dt;
    d.vx *= Math.exp(-dt * 2.5);
    const maxVx = p.wander * Math.abs(d.vy) * 0.6;
    if (d.vx > maxVx) d.vx = maxVx; else if (d.vx < -maxVx) d.vx = -maxVx;

    const dx = d.vx * dt;
    const dy = d.vy * dt;
    d.x += dx;
    d.y += dy;
    const travelH = Math.hypot(dx, dy) / H;

    // Leave mass behind as the drop travels.
    let area = Math.PI * d.r * d.r * Math.max(0, 1 - p.massLoss * travelH);
    if (p.residue > 0 && this.rand() < p.residue * travelH) {
      const rd = H * p.smallMin * lerp(0.4, 0.9, this.rand()) * p.sizeScale;
      const ra = Math.PI * (rd / 2) ** 2;
      if (ra < area * 0.25) {
        area -= ra;
        const residue = this.addDrop(d.x + (this.rand() - 0.5) * d.r * 0.6, d.y - d.r * 1.1, rd);
        residue.noMergeWith = d.id; // do not get re-absorbed immediately
      }
    }
    d.r = Math.sqrt(area / Math.PI);
    this.addTrailPoint(d, p);

    if (d.r * 2 < slideDiam * STOP_RATIO) {
      d.state = 'rest';
      d.vy = 0;
      d.vx = 0;
      if (d.trail) { d.trail.open = false; d.trail = null; }
    }
  }

  addTrailPoint(d, p) {
    const tr = d.trail;
    if (!tr) return;
    const w = Math.max(1, d.r * 2 * p.trailWidth);
    const last = tr.points[tr.points.length - 1];
    // Trail starts at the drop's upper edge so the drop body covers the newest part.
    const y = d.y - d.r * 0.6;
    if (!last || Math.hypot(d.x - last.x, y - last.y) >= Math.max(1.5, w * 0.45)) {
      tr.points.push({ x: d.x, y, w, t: this.time });
    }
  }

  updateTrails(p) {
    const fade = p.trailFade;
    for (const tr of this.trails) {
      let k = 0;
      while (k < tr.points.length - 1 && this.time - tr.points[k].t > fade) k++;
      if (k) tr.points.splice(0, k);
    }
    this.trails = this.trails.filter(
      (tr) => tr.open || (tr.points.length && this.time - tr.points[tr.points.length - 1].t <= fade),
    );
  }

  /** Coalesce touching drops (area-preserving), using a uniform grid for O(n) neighbour search. */
  mergeDrops() {
    const drops = this.drops;
    if (drops.length < 2) return;
    let maxR = 0;
    for (const d of drops) if (d.r > maxR) maxR = d.r;
    const cell = Math.max(4, maxR * 2);
    const grid = new Map();
    const key = (cx, cy) => cx * 73856093 ^ cy * 19349663;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (d.dead) continue;
      const k = key(Math.floor(d.x / cell), Math.floor(d.y / cell));
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(i);
    }
    for (let i = 0; i < drops.length; i++) {
      const a = drops[i];
      if (a.dead) continue;
      const cx = Math.floor(a.x / cell);
      const cy = Math.floor(a.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const list = grid.get(key(gx, gy));
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            const b = drops[j];
            if (b.dead || a.dead) continue;
            if (a.noMergeWith === b.id || b.noMergeWith === a.id) continue;
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < (a.r + b.r) * MERGE_TOUCH) this.coalesce(a, b);
          }
        }
      }
    }
    for (const d of drops) {
      // Residue becomes mergeable once it has separated from its parent.
      if (d.noMergeWith && this.time - d.born > 0.6) d.noMergeWith = 0;
    }
  }

  coalesce(a, b) {
    const [big, small] = a.r >= b.r ? [a, b] : [b, a];
    const A1 = big.r * big.r;
    const A2 = small.r * small.r;
    const A = A1 + A2;
    big.x = (big.x * A1 + small.x * A2) / A;
    big.y = (big.y * A1 + small.y * A2) / A;
    big.vx = (big.vx * A1 + small.vx * A2) / A;
    big.vy = (big.vy * A1 + small.vy * A2) / A;
    big.r = Math.sqrt(A);
    if (small.state === 'slide' && big.state !== 'slide') {
      // A falling drop that hits a resting one carries it along.
      big.state = 'slide';
      big.target = small.target;
      big.t = 0;
      big.trail = small.trail;
      small.trail = null;
    }
    if (small.trail) small.trail.open = false;
    small.dead = true;
    a.dead = big !== a;
    b.dead = big !== b;
  }
}
