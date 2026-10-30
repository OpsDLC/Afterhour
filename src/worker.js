// Runs the rain + outline composition off the main thread.
// Messages in:  { type: 'font', buffer }  |  { type: 'render', id, text, params }
// Messages out: { type: 'font', ok, name, error } | { type: 'render', id, d, artboard, stats } | { type: 'error', id, error }

import { parseFont } from './font.js';
import { Engine } from './engine.js';

let engine = null;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'font') {
    try {
      const font = parseFont(msg.buffer);
      if (engine) engine.setFont(font); else engine = new Engine(font);
      const name = font.names.fullName?.en || font.names.fontFamily?.en || 'Font';
      self.postMessage({ type: 'font', ok: true, name });
    } catch (err) {
      self.postMessage({ type: 'font', ok: false, error: err.message || String(err) });
    }
    return;
  }
  if (msg.type === 'render') {
    if (!engine) { self.postMessage({ type: 'error', id: msg.id, error: 'No font loaded' }); return; }
    try {
      const out = engine.render(msg.text, msg.params);
      self.postMessage({
        type: 'render',
        id: msg.id,
        d: out.paths.map((p) => p.d).join(''),
        artboard: out.artboard,
        stats: out.stats,
        time: engine.sim.time,
      });
    } catch (err) {
      self.postMessage({ type: 'error', id: msg.id, error: err.message || String(err) });
    }
  }
};
