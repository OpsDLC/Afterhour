// Rain on paper: ink bleeds into wet paper (feathered edges) and runs downward. Variants: dry/damp/wet.
import fs from 'node:fs';
import opentype from 'opentype.js';

const [file, tag] = process.argv.slice(2);
const src = opentype.parse(fs.readFileSync(file).buffer.slice(0));
const U = src.unitsPerEm;
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const rng = (seed) => { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const G = (d, w) => Math.exp(-((d / w) ** 2));
// 1D value noise along the outline, several octaves: paper fibres
function fibres(r) {
  const T = Array.from({ length: 512 }, () => r());
  const v = (x) => { const i = Math.floor(x), f = x - i, a = T[((i % 512) + 512) % 512], b = T[(((i + 1) % 512) + 512) % 512]; return a + (b - a) * f * f * (3 - 2 * f); };
  return (s) => { let n = 0, amp = 1, fr = 1, sum = 0; for (let o = 0; o < 4; o++) { n += v(s * fr) * amp; sum += amp; amp *= 0.55; fr *= 2.3; } return n / sum; };
}
function contours(cmds) {
  const out = []; let cur = null, cx = 0, cy = 0, sx = 0, sy = 0; const STEP = U * 0.006;
  const add = (x, y) => cur.push({ x, y });
  const seg = (fx, n) => { for (let i = 1; i <= n; i++) { const [x, y] = fx(i / n); add(x, y); } };
  for (const c of cmds) {
    if (c.type === 'M') { cur = [{ x: c.x, y: c.y }]; out.push(cur); cx = sx = c.x; cy = sy = c.y; }
    else if (c.type === 'L') { const n = Math.max(1, Math.ceil(Math.hypot(c.x - cx, c.y - cy) / STEP)); const ax = cx, ay = cy; seg((t) => [ax + (c.x - ax) * t, ay + (c.y - ay) * t], n); cx = c.x; cy = c.y; }
    else if (c.type === 'Q') { const ax = cx, ay = cy; const n = Math.max(1, Math.ceil((Math.hypot(c.x1 - ax, c.y1 - ay) + Math.hypot(c.x - c.x1, c.y - c.y1)) / STEP)); seg((t) => [(1 - t) ** 2 * ax + 2 * (1 - t) * t * c.x1 + t * t * c.x, (1 - t) ** 2 * ay + 2 * (1 - t) * t * c.y1 + t * t * c.y], n); cx = c.x; cy = c.y; }
    else if (c.type === 'C') { const ax = cx, ay = cy; const n = Math.max(1, Math.ceil(Math.hypot(c.x - ax, c.y - ay) / STEP) * 2); seg((t) => { const m = 1 - t; return [m ** 3 * ax + 3 * m * m * t * c.x1 + 3 * m * t * t * c.x2 + t ** 3 * c.x, m ** 3 * ay + 3 * m * m * t * c.y1 + 3 * m * t * t * c.y2 + t ** 3 * c.y]; }, n); cx = c.x; cy = c.y; }
    else if (c.type === 'Z' && Math.hypot(cx - sx, cy - sy) > 1) { const ax = cx, ay = cy; seg((t) => [ax + (sx - ax) * t, ay + (sy - ay) * t], Math.ceil(Math.hypot(sx - ax, sy - ay) / STEP)); }
  }
  for (const ct of out) {
    // orientation-independent outward normal: probe a little to each side
    const n = ct.length; let s = 0;
    ct.forEach((p, i) => { const a = ct[(i - 1 + n) % n], b = ct[(i + 1) % n]; const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1; p.nx = -ty / l; p.ny = tx / l; if (i) s += Math.hypot(p.x - ct[i - 1].x, p.y - ct[i - 1].y); p.s = s; });
  }
  return out;
}
function inside(cts, x, y) { let w = false; for (const r of cts) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) w = !w; } return w; }

function wetGlyph(cts, r, level, bb) {
  if (!level || !cts.length) return cts;
  // make every normal point outward (TrueType and CFF wind differently)
  for (const ct of cts) for (const p of ct) { const out = !inside(cts, p.x + p.nx * 3, p.y + p.ny * 3); if (!out) { p.nx = -p.nx; p.ny = -p.ny; } }
  const fib = fibres(r);
  // one wet patch, clearly larger than a stroke; sits in the upper two-thirds (where rain lands)
  const spot = { x: bb.x1 + (0.2 + r() * 0.6) * (bb.x2 - bb.x1), y: bb.y1 + (0.35 + r() * 0.55) * (bb.y2 - bb.y1), R: U * (0.1 + r() * 0.06) * (0.7 + level * 0.4) };
  const floor = bb.y1 + (bb.y2 - bb.y1) * 0.12;
  const bottoms = cts.flat().filter((p) => p.ny < -0.7 && p.y < floor && Math.abs(p.x - spot.x) < spot.R * 1.6 && !inside(cts, p.x, p.y - U * 0.02));
  const runs = process.env.RUNS !== '0' && level > 0.6 && bottoms.length ? Array.from({ length: 1 + Math.round(r()) }, () => { const p = bottoms[Math.floor(r() * bottoms.length)]; return { x: p.x, y: p.y, len: U * (0.03 + r() * 0.05) * level, w: U * (0.022 + r() * 0.014) }; }) : [];
  return cts.map((ct) => ct.map((p) => {
    const d = Math.hypot(p.x - spot.x, p.y - spot.y) / spot.R, wet = d >= 1.4 ? 0 : 1 - (d / 1.4) ** 2;
    // bleed: ink spreads into wet fibres; spiky feathering, stronger in the middle of the patch
    const f = fib(p.s / (U * 0.009));
    const bleed = wet * level * (U * 0.006 + U * 0.016 * Math.pow(Math.max(0, f - 0.3) / 0.7, 1.6));
    let x = p.x + p.nx * bleed, y = p.y + p.ny * bleed;
    for (const rn of runs) { if (p.ny > -0.2 || Math.abs(p.y - rn.y) > U * 0.03 || p.y > floor) continue; const dx = Math.abs(p.x - rn.x) / (rn.w * 1.6); const g = dx >= 1 ? 0 : Math.sqrt(1 - dx * dx) * Math.min(1, -p.ny * 1.4); y -= rn.len * g; x += (fib(p.y / (U * 0.01)) - 0.5) * rn.w * g; }
    return { x, y };
  }));
}
function toPath(cts) { const path = new opentype.Path(); for (const ct of cts) { ct.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y))); path.close(); } return path; }

for (const [vname, level] of [['dry', 0], ['damp', 0.45], ['wet', 1]]) {
  const glyphs = [new opentype.Glyph({ name: '.notdef', advanceWidth: src.glyphs.get(0).advanceWidth, path: new opentype.Path() })];
  for (const ch of CHARS) {
    const g = src.charToGlyph(ch), code = ch.charCodeAt(0), cts = contours(g.path.commands);
    const bbr = g.getBoundingBox(), bb = { x1: bbr.x1, x2: bbr.x2 || 1, y1: bbr.y1, y2: bbr.y2 || 1 };
    glyphs.push(new opentype.Glyph({ name: g.name || `u${code}`, unicode: code, advanceWidth: g.advanceWidth, path: toPath(wetGlyph(cts, rng(code * 7919 + (level > 0.5 ? 3 : 5)), level, bb)) }));
  }
  const font = new opentype.Font({ familyName: `P ${tag} ${vname}`, styleName: 'Regular', unitsPerEm: U, ascender: src.ascender, descender: src.descender, glyphs });
  fs.writeFileSync(`out/${process.env.RUNS === '0' ? 'i' : 'ii'}-${tag}-${vname}.otf`, Buffer.from(font.toArrayBuffer()));
}
