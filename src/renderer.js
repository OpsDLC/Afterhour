// Canvas 2D renderer (H4N-2). Each droplet is a lens: the text texture under it is
// drawn clipped to the drop, magnified and flipped. Wet trails act as weak vertical
// cylinder lenses (horizontal magnification only). No glass, window or 3D is drawn.

import { color, rgba } from './tokens.js';

const SPRITE = 128;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Magnification for a drop of diameter dH (in letter heights). */
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

/** Map a source interval to a destination interval, clamped to [0, limit] on the source side. */
function clampSpan(s0, s1, d0, d1, limit) {
  const k = (d1 - d0) / (s1 - s0);
  if (s0 < 0) { d0 += -s0 * k; s0 = 0; }
  if (s1 > limit) { d1 -= (s1 - limit) * k; s1 = limit; }
  return s1 - s0 > 0.5 ? [s0, s1, d0, d1] : null;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.tex = null;
    this.overlay = makeCanvas(SPRITE, SPRITE);
    this.overlayKey = '';
    this.glow = this.makeGlow();
  }

  resize(cssW, cssH, dpr) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  setTexture(tex) {
    this.tex = tex;
  }

  /** Droplet overlay: edge falloff into a dark ring, amber highlight upper-left, faint caustic lower-right. */
  updateOverlay(p) {
    const key = `${p.edgeFalloff}|${p.ringOpacity}|${p.highlight}`;
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    const c = this.overlay.getContext('2d');
    const R = SPRITE / 2;
    c.clearRect(0, 0, SPRITE, SPRITE);
    c.save();
    c.translate(R, R);
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.clip();

    const inner = Math.max(0, 1 - p.edgeFalloff);
    const ring = c.createRadialGradient(0, 0, 0, 0, 0, R);
    ring.addColorStop(0, rgba(color.bg, 0));
    ring.addColorStop(inner, rgba(color.bg, 0));
    ring.addColorStop(inner + (1 - inner) * 0.6, rgba(color.bg, p.ringOpacity * 0.75));
    ring.addColorStop(0.96, rgba(color.bg, p.ringOpacity));
    ring.addColorStop(1, rgba(color.bg, p.ringOpacity * 0.6));
    c.fillStyle = ring;
    c.fillRect(-R, -R, SPRITE, SPRITE);

    // Light gathered on the far side of the drop.
    const caustic = c.createRadialGradient(R * 0.32, R * 0.42, 0, R * 0.32, R * 0.42, R * 0.55);
    caustic.addColorStop(0, rgba(color.text, 0.1 * p.highlight));
    caustic.addColorStop(1, rgba(color.text, 0));
    c.fillStyle = caustic;
    c.fillRect(-R, -R, SPRITE, SPRITE);

    // Specular highlight — the only place (with splashes) amber is allowed.
    const hx = -R * 0.38;
    const hy = -R * 0.42;
    const hl = c.createRadialGradient(hx, hy, 0, hx, hy, R * 0.2);
    hl.addColorStop(0, rgba(color.amber, Math.min(1, p.highlight * 1.5)));
    hl.addColorStop(0.35, rgba(color.amber, p.highlight * 0.6));
    hl.addColorStop(1, rgba(color.amber, 0));
    c.fillStyle = hl;
    c.fillRect(-R, -R, SPRITE, SPRITE);
    c.restore();
  }

  makeGlow() {
    const c = makeCanvas(SPRITE, SPRITE);
    const g = c.getContext('2d');
    const R = SPRITE / 2;
    const grad = g.createRadialGradient(R, R, R * 0.35, R, R, R);
    grad.addColorStop(0, rgba(color.amber, 0));
    grad.addColorStop(0.55, rgba(color.amber, 0.5));
    grad.addColorStop(1, rgba(color.amber, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    return c;
  }

  draw(sim, p) {
    const { ctx, dpr, tex } = this;
    if (!tex) return;
    const texW = tex.canvas.width;
    const texH = tex.canvas.height;
    this.updateOverlay(p);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tex.canvas, 0, 0);

    this.drawTrails(sim, p, texW, texH);

    // Resting drops first, moving drops on top.
    const drops = sim.drops;
    for (let pass = 0; pass < 2; pass++) {
      for (const d of drops) {
        const moving = d.state !== 'rest';
        if (moving !== (pass === 1)) continue;
        this.drawDrop(d, sim, p, texW, texH);
      }
    }

    if (sim.splashes.length && p.splash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of sim.splashes) {
        const k = s.t / s.life;
        const a = s.strength * (1 - k) * (1 - k);
        if (a <= 0.005) continue;
        const rr = s.r * (1.15 + k * 1.1);
        ctx.globalAlpha = a * 0.6;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.drawImage(this.glow, s.x - rr, s.y - rr, rr * 2, rr * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  drawDrop(d, sim, p, texW, texH) {
    const { ctx, dpr, tex } = this;
    const H = tex.H;
    // Shape: sliding drops stretch along their path; merges make them wobble.
    const stretch = Math.min(0.32, Math.abs(d.vy) / (H * 14));
    const wob = d.wobble * 0.09 * Math.sin(sim.time * 26 + d.seed);
    const rx = d.r * (1 - stretch * 0.35) * (1 + wob);
    const ry = d.r * (1 + stretch) * (1 - wob);
    const cx = d.x;
    const cy = d.y;
    if (cx + rx < 0 || cx - rx > this.cssW || cy + ry < 0 || cy - ry > this.cssH) return;

    if (d.r * dpr >= 2.5) {
      const m = magnificationFor((d.r * 2) / H, p);
      const f = p.flip ? -1 : 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = color.bg;
      ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      // In the drop's local (optionally flipped) frame, dest [-rx, rx] samples source [cx - rx/m, cx + rx/m].
      const sx = clampSpan((cx - rx / m) * dpr, (cx + rx / m) * dpr, -rx, rx, texW);
      const sy = clampSpan((cy - ry / m) * dpr, (cy + ry / m) * dpr, -ry, ry, texH);
      if (sx && sy) {
        ctx.setTransform(dpr * f, 0, 0, dpr * f, cx * dpr, cy * dpr);
        ctx.drawImage(tex.canvas, sx[0], sy[0], sx[1] - sx[0], sy[1] - sy[0],
          sx[2], sy[2], sx[3] - sx[2], sy[3] - sy[2]);
      }
      ctx.restore();
    }
    // Small drops catch less light: fade their ring and highlight.
    ctx.globalAlpha = Math.min(1, 0.35 + 0.65 * ((d.r * 2) / H));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.overlay, cx - rx, cy - ry, rx * 2, ry * 2);
    ctx.globalAlpha = 1;
  }

  drawTrails(sim, p, texW, texH) {
    const { ctx, dpr, tex } = this;
    const CHUNK = 10;
    for (const tr of sim.trails) {
      const pts = tr.points;
      for (let i = 0; i < pts.length - 1; i += CHUNK - 1) {
        const end = Math.min(pts.length, i + CHUNK);
        const mid = pts[(i + end - 1) >> 1];
        const life = 1 - (sim.time - mid.t) / p.trailFade;
        if (life <= 0) continue;
        // Fade by easing the magnification back to 1 rather than by alpha: a fully
        // faded trail is then pixel-identical to the dry text (no blending seams).
        const a = life * life * (3 - 2 * life);
        const mag = 1 + (p.trailMag - 1) * a;
        if (mag < 1.004) continue;

        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, sumX = 0;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        // Union of round caps and segment quads: a smooth band. Quads are wound
        // the same way as the arcs so the nonzero clip has no holes.
        for (let k = i; k < end; k++) {
          const q = pts[k];
          const r = q.w / 2;
          // Chunks meet flat at their shared point (no caps there) so the sheen never doubles up.
          if ((k > i || i === 0) && (k < end - 1 || end === pts.length)) {
            ctx.moveTo(q.x + r, q.y);
            ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
          }
          if (k + 1 < end) {
            const n = pts[k + 1];
            const len = Math.hypot(n.x - q.x, n.y - q.y) || 1;
            const ux = -(n.y - q.y) / len;
            const uy = (n.x - q.x) / len;
            const rn = n.w / 2;
            ctx.moveTo(q.x - ux * r, q.y - uy * r);
            ctx.lineTo(n.x - ux * rn, n.y - uy * rn);
            ctx.lineTo(n.x + ux * rn, n.y + uy * rn);
            ctx.lineTo(q.x + ux * r, q.y + uy * r);
            ctx.closePath();
          }
          x0 = Math.min(x0, q.x - r); x1 = Math.max(x1, q.x + r);
          y0 = Math.min(y0, q.y - r); y1 = Math.max(y1, q.y + r);
          sumX += q.x;
        }
        ctx.clip();
        const cx = sumX / (end - i);
        ctx.fillStyle = color.bg;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        // Screen x = cx + (srcX - cx) * mag; y is unchanged (a vertical film of water).
        const sx = clampSpan((cx + (x0 - cx) / mag) * dpr, (cx + (x1 - cx) / mag) * dpr, x0, x1, texW);
        const sy = clampSpan(y0 * dpr, y1 * dpr, y0, y1, texH);
        if (sx && sy) {
          ctx.drawImage(tex.canvas, sx[0], sy[0], sx[1] - sx[0], sy[1] - sy[0],
            sx[2], sy[2], sx[3] - sx[2], sy[3] - sy[2]);
        }
        // A faint sheen of wet film (lighter only, so faded trails never leave dark seams).
        ctx.globalAlpha = a * p.trailSheen;
        ctx.fillStyle = color.text;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.restore();
      }
    }
  }
}
