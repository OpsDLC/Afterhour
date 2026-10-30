// Glue: font + text + parameters + time → glyph outlines with rain applied.
// The rain is replayed deterministically from t = 0 at a fixed step, so a given
// (seed, parameters, time) always produces the same outlines.

import { layoutText } from './font.js';
import { RainSim, mulberry32 } from './sim.js';
import { compose } from './compose.js';
import { simKeys } from './params.js';

export const STEP = 1 / 60;

export class Engine {
  constructor(font) {
    this.font = font;
    this.text = '';
    this.layout = null;
    this.sim = null;
    this.simSig = '';
    this.layoutSig = '';
  }

  setFont(font) {
    this.font = font;
    this.layoutSig = '';
  }

  /** Lay out the text (cached) and size the artboard around it. */
  ensureLayout(text, p) {
    const sig = JSON.stringify([text, p.size, p.lineHeight, p.tracking, p.align, p.padding, p.flatten]);
    if (sig === this.layoutSig) return this.layout;
    const probe = layoutText(this.font, text, { size: p.size, lineHeight: p.lineHeight, tracking: p.tracking, align: p.align });
    const pad = probe.H * p.padding;
    const layout = layoutText(this.font, text, {
      size: p.size, lineHeight: p.lineHeight, tracking: p.tracking, align: p.align, flatten: p.flatten, origin: [pad, pad],
    });
    layout.artboard = { width: probe.width + pad * 2, height: probe.height + pad * 2 };
    // Rain aims at the glyphs' actual ink box.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of layout.glyphs) {
      x0 = Math.min(x0, g.bbox.x0); y0 = Math.min(y0, g.bbox.y0);
      x1 = Math.max(x1, g.bbox.x1); y1 = Math.max(y1, g.bbox.y1);
    }
    layout.inkBox = layout.glyphs.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 1, h: 1 };
    this.layout = layout;
    this.layoutSig = sig;
    this.simSig = '';
    return layout;
  }

  /** Rain state at time `t` (replays from 0 when anything upstream changed or time went back). */
  rainAt(t, p) {
    const sig = JSON.stringify([...simKeys].map((k) => p[k]));
    if (sig !== this.simSig || !this.sim || this.sim.time > t + 1e-9) {
      this.sim = new RainSim({ rand: mulberry32(p.seed >>> 0) });
      const L = this.layout;
      this.sim.setLayout({ width: L.artboard.width, height: L.artboard.height, H: L.H, textBox: L.inkBox });
      this.simSig = sig;
    }
    while (this.sim.time + STEP / 2 < t) this.sim.update(STEP, p);
    return this.sim;
  }

  render(text, p) {
    const layout = this.ensureLayout(text, p);
    const sim = this.rainAt(p.time, p);
    const out = compose(layout, sim, p);
    out.artboard = layout.artboard;
    return out;
  }
}
