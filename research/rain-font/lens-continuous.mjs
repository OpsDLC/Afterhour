// Mockups: five rain styles as continuous, point-compatible warps of glyph outlines.
import fs from 'node:fs';
import opentype from 'opentype.js';

const [file, tag] = process.argv.slice(2);
const src = opentype.parse(fs.readFileSync(file).buffer.slice(0));
const U = src.unitsPerEm;
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const rng = (seed) => { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const G = (d, w) => Math.exp(-((d / w) ** 2));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// contours of points: {x,y,on}; quadratic segments subdivided so masters share points
function contours(cmds) {
  const out = []; let cur = null, cx = 0, cy = 0, sx = 0, sy = 0; const STEP = U * 0.018;
  const line = (tx, ty) => { const n = Math.max(1, Math.ceil(Math.hypot(tx - cx, ty - cy) / STEP)); for (let i = 1; i <= n; i++) cur.push({ x: cx + (tx - cx) * i / n, y: cy + (ty - cy) * i / n, on: true }); cx = tx; cy = ty; };
  for (const c of cmds) {
    if (c.type === 'M') { cur = [{ x: c.x, y: c.y, on: true }]; out.push(cur); cx = sx = c.x; cy = sy = c.y; }
    else if (c.type === 'L') line(c.x, c.y);
    else if (c.type === 'Q') {
      const n = Math.max(1, Math.ceil((Math.hypot(c.x1 - cx, c.y1 - cy) + Math.hypot(c.x - c.x1, c.y - c.y1)) / STEP));
      const P = (t) => ({ x: (1 - t) ** 2 * cx + 2 * (1 - t) * t * c.x1 + t * t * c.x, y: (1 - t) ** 2 * cy + 2 * (1 - t) * t * c.y1 + t * t * c.y });
      const Dv = (t) => ({ x: 2 * (1 - t) * (c.x1 - cx) + 2 * t * (c.x - c.x1), y: 2 * (1 - t) * (c.y1 - cy) + 2 * t * (c.y - c.y1) });
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, a = P(t0), b = P(t1), da = Dv(t0), h = (t1 - t0) / 2; cur.push({ x: a.x + da.x * h, y: a.y + da.y * h, on: false }); cur.push({ x: b.x, y: b.y, on: true }); }
      cx = c.x; cy = c.y;
    } else if (c.type === 'Z') { if (Math.hypot(cx - sx, cy - sy) > 1) line(sx, sy); }
  }
  // outward normal (TrueType: filled area on the right of travel) and arc position
  for (const ct of out) {
    let s = 0; const n = ct.length;
    ct.forEach((p, i) => { const a = ct[(i - 1 + n) % n], b = ct[(i + 1) % n]; const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1; p.nx = -ty / l; p.ny = tx / l; if (i) s += Math.hypot(p.x - ct[i - 1].x, p.y - ct[i - 1].y); p.s = s; });
    ct.len = s;
  }
  return out;
}
function toPath(cts) {
  const path = new opentype.Path();
  for (const ct of cts) {
    path.moveTo(ct[0].x, ct[0].y);
    for (let i = 1; i < ct.length; i++) { const p = ct[i]; if (p.on) path.lineTo(p.x, p.y); else { const q = ct[i + 1]; path.quadraticCurveTo(p.x, p.y, q.x, q.y); i++; } }
    path.close();
  }
  return path;
}
const onStroke = (cts, r) => { const ct = cts[Math.floor(r() * cts.length)]; const p = ct[Math.floor(r() * ct.length)]; const d = U * (0.015 + r() * 0.025); return { x: p.x - p.nx * d, y: p.y - p.ny * d }; };

function placeDrops(cts, r, n, size) {
  const out = [];
  for (let tries = 0; out.length < n && tries < 40; tries++) {
    const big = out.length === 0;
    const d = { ...onStroke(cts, r), r: U * size * (big ? 0.9 + r() * 0.3 : 0.35 + r() * 0.3) };
    if (out.every((o) => Math.hypot(o.x - d.x, o.y - d.y) > (o.r + d.r) * 1.15)) out.push(d);
  }
  return out;
}
function lens(d, x, y, m, stretchUp) {
  const dx = x - d.x, dy = y - d.y, sy = dy > 0 ? 1 + stretchUp : 1;
  const rho = Math.hypot(dx, dy / sy);
  if (!rho || rho >= d.r) return null;
  const k = (1 - (1 - rho / d.r) ** m) * d.r / rho;
  return { x: d.x + dx * k, y: d.y + dy * k };
}
function trail(d, x, y, len, wf = 0.32, m = 1.8, wave = 0) {
  const w = d.r * wf, t = (x - d.x) / w;
  if (Math.abs(t) >= 1 || y < d.y || y > d.y + len) return null;
  const fade = 1 - (y - d.y) / len, a = Math.abs(t) || 1e-6;
  const k = 1 + ((1 - (1 - a) ** m) / a - 1) * fade;
  return { x: d.x + (x - d.x) * k + wave * fade * (1 - a * a) * Math.sin((y - d.y) / (U * 0.05)), y };
}
const STYLES = {
  // C+: grow and merge; at heavy rain the biggest drop slides: long teardrop, wide trail with beads
  slide2(cts, r, L) {
    const drops = placeDrops(cts, r, 2, 0.03 + L * 0.055);
    const k = Math.max(0, (L - 0.35) / 0.65);
    const head = drops[0];
    const slid = head && { ...head, y: head.y - U * 0.12 * k, r: head.r * (1 + 0.15 * k) };
    const beads = slid ? [0.35, 0.65].map((f, i) => ({ x: slid.x + (r() - 0.5) * slid.r * 0.3, y: slid.y + U * 0.8 * k * f, r: slid.r * (0.32 - i * 0.08) })) : [];
    return (p) => {
      let q = p;
      if (slid && k > 0) {
        q = trail(slid, q.x, q.y, U * 0.85 * k, 0.5, 2.4, U * 0.012) || q;
        for (const b of beads) q = lens(b, q.x, q.y, 2.2, 0) || q;
      }
      drops.forEach((d, i) => { q = i === 0 && k > 0 ? lens(slid, q.x, q.y, 2.3, k * 2.6) || q : lens(d, q.x, q.y, 2.2, 0) || q; });
      return q;
    };
  },
  orig(cts, r, L) {
    const drops = Array.from({ length: Math.round(1 + L * 5) }, () => ({ ...onStroke(cts, r), r: U * (0.025 + r() * 0.05) * (0.6 + L * 0.6) }));
    return (p) => { let q = p; for (const d of drops) q = lens(d, q.x, q.y, 2.4, 0) || q; return q; };
  },
  merge(cts, r, L) {
    const drops = placeDrops(cts, r, L < 0.7 ? 2 : 1 + Math.round(r()), 0.03 + L * 0.07);
    return (p) => { let q = p; for (const d of drops) q = lens(d, q.x, q.y, 2.2, 0) || q; return q; };
  },
  slide(cts, r, L) {
    const drops = placeDrops(cts, r, 2, 0.045);
    const slides = drops.map((d, i) => i === 0 && L > 0.25);
    return (p) => { let q = p; drops.forEach((d, i) => { if (slides[i]) q = trail(d, q.x, q.y, U * 0.5 * L) || q; q = lens(d, q.x, q.y, 2.2, slides[i] ? L * 1.2 : 0) || q; }); return q; };
  },
  both(cts, r, L) {
    const drops = placeDrops(cts, r, 2, 0.03 + L * 0.055);
    return (p) => { let q = p; drops.forEach((d, i) => { const sl = i === 0 && L > 0.4; if (sl) q = trail(d, q.x, q.y, U * 0.55 * (L - 0.3)) || q; q = lens(d, q.x, q.y, 2.2, sl ? (L - 0.3) * 1.5 : 0) || q; }); return q; };
  },
};

for (const [name, make] of Object.entries(STYLES)) for (const L of [0.3, 0.6, 1]) {
  const glyphs = [new opentype.Glyph({ name: '.notdef', advanceWidth: src.glyphs.get(0).advanceWidth, path: new opentype.Path() })];
  for (const ch of CHARS) {
    const g = src.charToGlyph(ch), code = ch.charCodeAt(0), cts = contours(g.path.commands);
    const bbr = g.getBoundingBox(), bb = { x1: bbr.x1, x2: bbr.x2 || 1, y1: bbr.y1, y2: bbr.y2 || 1 };
    const r = rng(code * 7919 + 101), f = cts.length ? make(cts, r, L, bb) : null;
    const warped = cts.map((ct, ci) => { const o = ct.map((p) => ({ ...f(p, ci, ct), on: p.on })); o.len = ct.len; return o; });
    glyphs.push(new opentype.Glyph({ name: g.name || `u${code}`, unicode: code, advanceWidth: g.advanceWidth, path: toPath(warped) }));
  }
  const font = new opentype.Font({ familyName: `R ${tag} ${name} ${L}`, styleName: 'Regular', unitsPerEm: U, ascender: src.ascender, descender: src.descender, glyphs });
  fs.writeFileSync(`out/${tag}-${name}-${L}.otf`, Buffer.from(font.toArrayBuffer()));
}
