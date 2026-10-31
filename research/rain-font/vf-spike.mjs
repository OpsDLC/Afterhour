// Spike: rain-warp glyph outlines into point-compatible masters, write OTF masters.
import fs from 'node:fs';
import opentype from 'opentype.js';

const src = opentype.parse(fs.readFileSync('EBGaramond-Regular.ttf').buffer);
const upm = src.unitsPerEm;
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));

// --- deterministic rain field per glyph and level -------------------------------------------
function rng(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function field(code, level, bbox) {
  const r = rng(code * 7919 + 13);
  const drops = [], trails = [];
  const n = Math.round(2 + level * 10);
  for (let i = 0; i < n; i++) {
    const rad = upm * (0.03 + Math.pow(r(), 2.2) * (0.08 + level * 0.12));
    drops.push({ x: bbox.x1 + r() * (bbox.x2 - bbox.x1), y: bbox.y1 + r() * (bbox.y2 - bbox.y1), r: rad, m: 1.5 + rad / upm * 4 });
  }
  const nt = level > 0.4 ? Math.round(level * 3) : 0;
  for (let i = 0; i < nt; i++) trails.push({ x: bbox.x1 + r() * (bbox.x2 - bbox.x1), y0: bbox.y2 - r() * upm * 0.2, w: upm * (0.012 + r() * 0.02), len: upm * (0.3 + r() * 0.5) });
  return { drops, trails };
}
// forward map: each drop is a continuous bulge (magnifies centre, compresses the rim to 0 slope)
function warp(p, f) {
  let { x, y } = p;
  for (const d of f.drops) {
    const dx = x - d.x, dy = y - d.y, rho = Math.hypot(dx, dy);
    if (rho >= d.r || rho === 0) continue;
    const u = rho / d.r, g = 1 - Math.pow(1 - u, d.m);
    const k = (g * d.r) / rho; x = d.x + dx * k; y = d.y + dy * k;
  }
  for (const t of f.trails) {
    const bx = Math.exp(-(((x - t.x) / t.w) ** 2));
    if (bx < 1e-3 || y > t.y0 || y < t.y0 - t.len) continue;
    const along = (t.y0 - y) / t.len;
    y -= bx * along * t.len * 0.12; x += bx * Math.sin(y / (upm * 0.03)) * t.w * 0.4;
  }
  return { x, y };
}
// --- subdivide so every master has the same points ------------------------------------------
const STEP = upm * 0.02;
function subdivide(cmds) {
  const out = []; let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const c of cmds) {
    if (c.type === 'M') { out.push({ ...c }); cx = sx = c.x; cy = sy = c.y; }
    else if (c.type === 'L' || c.type === 'Z') {
      const tx = c.type === 'Z' ? sx : c.x, ty = c.type === 'Z' ? sy : c.y;
      const n = Math.max(1, Math.ceil(Math.hypot(tx - cx, ty - cy) / STEP));
      for (let i = 1; i <= n; i++) out.push({ type: 'L', x: cx + (tx - cx) * i / n, y: cy + (ty - cy) * i / n });
      if (c.type === 'Z') out.push({ type: 'Z' }); cx = tx; cy = ty;
    } else if (c.type === 'Q') {
      const n = Math.max(1, Math.ceil((Math.hypot(c.x1 - cx, c.y1 - cy) + Math.hypot(c.x - c.x1, c.y - c.y1)) / STEP));
      // split quadratic into n equal-t pieces
      const P = (t) => ({ x: (1 - t) ** 2 * cx + 2 * (1 - t) * t * c.x1 + t * t * c.x, y: (1 - t) ** 2 * cy + 2 * (1 - t) * t * c.y1 + t * t * c.y });
      const D = (t) => ({ x: 2 * (1 - t) * (c.x1 - cx) + 2 * t * (c.x - c.x1), y: 2 * (1 - t) * (c.y1 - cy) + 2 * t * (c.y - c.y1) });
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, a = P(t0), b = P(t1), da = D(t0), h = (t1 - t0) / 2;
        out.push({ type: 'Q', x1: a.x + da.x * h, y1: a.y + da.y * h, x: b.x, y: b.y });
      }
      cx = c.x; cy = c.y;
    } else if (c.type === 'C') { out.push({ ...c }); cx = c.x; cy = c.y; }
  }
  return out;
}
const LEVELS = [0, 0.5, 1];
const masters = LEVELS.map(() => []);
for (const ch of ['.notdef', ...CHARS]) {
  const g = ch === '.notdef' ? src.glyphs.get(0) : src.charToGlyph(ch);
  const base = subdivide(g.path.commands);
  const bb = g.getBoundingBox();
  const bbox = { x1: bb.x1, x2: Math.max(bb.x2, bb.x1 + 1), y1: bb.y1, y2: Math.max(bb.y2, bb.y1 + 1) };
  LEVELS.forEach((lv, i) => {
    const f = field(ch.charCodeAt(0), lv, bbox);
    const path = new opentype.Path();
    path.commands = lv === 0 ? base.map((c) => ({ ...c })) : base.map((c) => {
      if (c.type === 'Z') return c;
      const p = warp({ x: c.x, y: c.y }, f); const o = { ...c, x: p.x, y: p.y };
      if (c.type === 'Q') { const q = warp({ x: c.x1, y: c.y1 }, f); o.x1 = q.x; o.y1 = q.y; }
      return o;
    });
    masters[i].push(new opentype.Glyph({ name: ch === '.notdef' ? '.notdef' : g.name || `uni${ch.charCodeAt(0).toString(16)}`, unicode: ch === '.notdef' ? undefined : ch.charCodeAt(0), advanceWidth: g.advanceWidth, path }));
  });
}
LEVELS.forEach((lv, i) => {
  const font = new opentype.Font({ familyName: 'Afterhour Rain Spike', styleName: `Rain${lv * 100}`, unitsPerEm: upm, ascender: src.ascender, descender: src.descender, glyphs: masters[i] });
  fs.writeFileSync(`master-${lv * 100}.otf`, Buffer.from(font.toArrayBuffer()));
});
console.log('glyphs', masters[0].length, 'points/glyph(A)', masters[0][34].path.commands.length);
