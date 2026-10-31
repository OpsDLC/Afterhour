// Crisp optical drops: real boolean cuts on glyph outlines, placed on stems, two sizes only.
import fs from 'node:fs';
import opentype from 'opentype.js';
import pc from 'polygon-clipping';

const [file, tag] = process.argv.slice(2);
const src = opentype.parse(fs.readFileSync(file).buffer.slice(0));
const U = src.unitsPerEm;
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const rng = (seed) => { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

function rings(cmds) {
  const out = []; let cur = null, cx = 0, cy = 0;
  for (const c of cmds) {
    if (c.type === 'M') { cur = [[c.x, c.y]]; out.push(cur); cx = c.x; cy = c.y; }
    else if (c.type === 'L') { cur.push([c.x, c.y]); cx = c.x; cy = c.y; }
    else if (c.type === 'Q') { for (let i = 1; i <= 8; i++) { const t = i / 8; cur.push([(1 - t) ** 2 * cx + 2 * (1 - t) * t * c.x1 + t * t * c.x, (1 - t) ** 2 * cy + 2 * (1 - t) * t * c.y1 + t * t * c.y]); } cx = c.x; cy = c.y; }
    else if (c.type === 'C') { for (let i = 1; i <= 10; i++) { const t = i / 10, m = 1 - t; cur.push([m ** 3 * cx + 3 * m * m * t * c.x1 + 3 * m * t * t * c.x2 + t ** 3 * c.x, m ** 3 * cy + 3 * m * m * t * c.y1 + 3 * m * t * t * c.y2 + t ** 3 * c.y]); } cx = c.x; cy = c.y; }
  }
  for (const r of out) for (const p of r) { p[0] = q(p[0]); p[1] = q(p[1]); }
  for (const r of out) if (r.length && (r[0][0] !== r.at(-1)[0] || r[0][1] !== r.at(-1)[1])) r.push([...r[0]]);
  return out.filter((r) => r.length > 3);
}
// glyph as a proper multipolygon (union of rings with even-odd handled by xor)
const glyphGeom = (rs) => rs.reduce((acc, r) => (acc ? pc.xor(acc, [[r]]) : [[r]]), null) || [];
const q = (v) => Math.round(v);
const circle = (x, y, r, n = 72) => { const a = []; for (let i = 0; i < n; i++) { const t = (i / n) * 2 * Math.PI; a.push([q(x + r * Math.cos(t)), q(y + r * Math.sin(t))]); } a.push([...a[0]]); return [[a]]; };
const mapGeom = (g, f) => g.map((poly) => poly.map((ring) => ring.map(([x, y]) => f(x, y).map(q))));
function inside(rs, x, y) { let w = false; for (const r of rs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) w = !w; } return w; }
function edgeDist(rs, x, y) { let m = Infinity; for (const r of rs) for (let i = 1; i < r.length; i++) { const [ax, ay] = r[i - 1], [bx, by] = r[i]; const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return m; }

// drop sites on stem centres (max distance to edge), at most two, sized from the local stem
function edgeSites(rs, r, n) {
  const pts = rs.flat();
  const out = [];
  for (let tries = 0; out.length < n && tries < 200; tries++) {
    const [x, y] = pts[Math.floor(r() * pts.length)];
    // local stem: step inward until we leave the ink
    let half = 0; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { let k = 4; while (k < U * 0.2 && inside(rs, x + dx * k, y + dy * k)) k += 4; half = Math.max(half, k / 2); }
    const big = out.length === 0, R = Math.max(U * 0.02, half) * (big ? 1.5 : 0.9);
    const c = { x: x + (r() - 0.5) * R * 0.6, y: y + (r() - 0.5) * R * 0.6, R };
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > o.R + c.R)) out.push(c);
  }
  return out;
}
function sites(rs, r, n) {
  const xs = rs.flat().map((p) => p[0]), ys = rs.flat().map((p) => p[1]);
  const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cand = [];
  for (let i = 0; i < 400; i++) { const x = x1 + r() * (x2 - x1), y = y1 + r() * (y2 - y1); if (inside(rs, x, y)) cand.push({ x, y, half: edgeDist(rs, x, y) }); }
  cand.sort((a, b) => b.half - a.half);
  const out = [];
  for (const c of cand.slice(0, 60)) {
    if (out.length >= n) break;
    const big = out.length === 0, R = c.half * (big ? 1.9 : 1.15);
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > o.R + R + c.half)) out.push({ ...c, R });
    if (r() < 0.3) cand.push(cand.shift());
  }
  return out;
}

const STYLES = {
  // photographic lens: inside is the glyph magnified ×1.7 and turned 180°
  optic: (g, d) => { const m = 1.7, s = d.R / m; const part = pc.intersection(g, circle(d.x, d.y, s)); return mapGeom(part, (x, y) => [d.x - (x - d.x) * m, d.y - (y - d.y) * m]); },
  // graphic refraction: inside is the same glyph shifted down-right, no magnification
  shift: (g, d) => pc.intersection(mapGeom(g, (x, y) => [x + d.R * 0.35, y - d.R * 0.55]), circle(d.x, d.y, d.R)),
  // calm magnifier: inside magnified ×1.5, upright
  magnify: (g, d) => { const m = 1.5; return mapGeom(pc.intersection(g, circle(d.x, d.y, d.R / m)), (x, y) => [d.x + (x - d.x) * m, d.y + (y - d.y) * m]); },
};

let skipped = 0;
for (const [name, lensFn] of Object.entries(STYLES)) for (const L of [0.6, 1]) {
  const glyphs = [new opentype.Glyph({ name: '.notdef', advanceWidth: src.glyphs.get(0).advanceWidth, path: new opentype.Path() })];
  for (const ch of CHARS) {
    const gl = src.charToGlyph(ch), code = ch.charCodeAt(0), rs = rings(gl.path.commands);
    let geom = rs.length ? glyphGeom(rs) : [];
    if (rs.length) {
      const ds = edgeSites(rs, rng(code * 7919 + 77), L < 0.8 ? 1 : 2).map((d) => ({ ...d, R: d.R * (0.6 + 0.4 * L) }));
      for (const d of ds) { try { const cut = pc.difference(geom, circle(d.x, d.y, d.R)); const lens = lensFn(geom, d); geom = pc.union(cut, lens.length ? lens : []); } catch { skipped++; } }
    }
    const path = new opentype.Path();
    for (const poly of geom) for (const ring of poly) { ring.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); path.close(); }
    glyphs.push(new opentype.Glyph({ name: gl.name || `u${code}`, unicode: code, advanceWidth: gl.advanceWidth, path }));
  }
  const font = new opentype.Font({ familyName: `O ${tag} ${name} ${L}`, styleName: 'Regular', unitsPerEm: U, ascender: src.ascender, descender: src.descender, glyphs });
  fs.writeFileSync(`out/${tag}-${name}-${L}.otf`, Buffer.from(font.toArrayBuffer()));
}

console.log(tag, 'drops skipped by boolean errors:', skipped);
