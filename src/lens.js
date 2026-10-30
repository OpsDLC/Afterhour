// How rain reshapes outlines.
//
// Drop: a lens. Inside the drop's footprint the outline is replaced by the outline found
// under a larger "source" ellipse, mapped radially into the drop — magnified at the centre,
// compressed toward the rim, and (optionally) turned 180° like a real water drop.
//
// Trail: a thin wet film. Points inside the band are pushed away from its centreline
// (a 1-D magnification that fades to identity at the band edge), so outlines stay continuous.

export const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Magnification for a drop of diameter dH (letter heights): anchors at 0.45 / 1.0 / 1.8 H. */
export function magnificationFor(dH, p) {
  const pts = [[0.45, p.magSmall], [1.0, p.magMedium], [1.8, p.magLarge]];
  if (dH <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (dH <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (dH - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * Radial lens profile in normalised drop space. Display radius u ∈ [0, 1] shows the
 * source at radius v = h(u): v = u/m in the core, then compresses quadratically over the
 * outer `edge` fraction (C1-continuous), reaching v = (1 + edge·gain)/m at the rim.
 */
export function lensProfile(m, edge, gain = 3) {
  const core = 1 - edge;
  const vmax = (1 + edge * gain) / m;
  const K = edge > 0 ? (vmax - 1 / m) / (edge * edge) : 0;
  const vCore = core / m;
  return {
    m,
    vmax,
    h(u) {
      if (u <= core || K === 0) return u / m;
      const t = u - core;
      return vCore + t / m + K * t * t;
    },
    hInv(v) {
      if (v <= vCore || K === 0) return Math.min(1, v * m);
      const c = v - vCore;
      const t = (-1 / m + Math.sqrt(1 / (m * m) + 4 * K * c)) / (2 * K);
      return Math.min(1, core + t);
    },
  };
}

/** Footprint of a drop: sliding drops stretch along their path. */
export function dropShape(d, H) {
  const stretch = Math.min(0.32, Math.abs(d.vy) / (H * 14));
  return { cx: d.x, cy: d.y, rx: d.r * (1 - stretch * 0.35), ry: d.r * (1 + stretch) };
}

export function ellipsePolygon(cx, cy, rx, ry, n = 96) {
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  ring.push(ring[0]);
  return [ring];
}

/** Build the forward map for one drop: source point → displayed point. */
export function dropMapper(shape, profile, flip) {
  const { cx, cy, rx, ry } = shape;
  const sgn = flip ? -1 : 1;
  return (x, y) => {
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    const v = Math.hypot(nx, ny);
    if (v < 1e-9) return [cx, cy];
    const u = profile.hInv(Math.min(v, profile.vmax));
    const k = (sgn * u) / v;
    return [cx + nx * k * rx, cy + ny * k * ry];
  };
}

/**
 * Trail warp from the simulation's trails at `time`. Returns { bands, warp } where bands are
 * bounding boxes (to find affected glyphs) and warp(x, y) → [x', y].
 */
export function trailWarper(trails, p, time) {
  const amp = p.trailMag - 1;
  const items = [];
  for (const tr of trails) {
    const pts = tr.points
      .map((q) => ({ x: q.x, y: q.y, hw: q.w / 2, a: amp * smoothstep(1 - (time - q.t) / p.trailFade) }))
      .filter((q) => q.a > 1e-4);
    if (pts.length < 2) continue;
    pts.sort((a, b) => a.y - b.y);
    let x0 = Infinity, x1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q.x - q.hw); x1 = Math.max(x1, q.x + q.hw); }
    items.push({ pts, bbox: { x0, x1, y0: pts[0].y, y1: pts[pts.length - 1].y } });
  }

  function warp(x, y) {
    let nx = x;
    for (const it of items) {
      const b = it.bbox;
      if (y < b.y0 || y > b.y1 || x < b.x0 || x > b.x1) continue;
      const pts = it.pts;
      let lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].y <= y) lo = mid; else hi = mid; }
      const A = pts[lo], B = pts[hi];
      const t = B.y > A.y ? (y - A.y) / (B.y - A.y) : 0;
      const cx = A.x + (B.x - A.x) * t;
      const hw = A.hw + (B.hw - A.hw) * t;
      let a = A.a + (B.a - A.a) * t;
      // Taper at both ends of the trail so the band has no hard top/bottom edge.
      a *= smoothstep((y - b.y0) / hw) * smoothstep((b.y1 - y) / hw);
      const dd = nx - cx;
      const s = Math.abs(dd) / hw;
      if (s < 1) nx = cx + dd * (1 + a * (1 - s) * (1 - s));
    }
    return [nx, y];
  }

  return { bands: items.map((i) => i.bbox), warp };
}
