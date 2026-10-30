import { schema, defaults } from './params.js';
import { buildSvg, svgToPng, download } from './svg.js';
import { STEP } from './engine.js';

const DEFAULT_TEXT = 'Afterhour\nnight rain';
const DEFAULT_FONT_URL = 'assets/fonts/InstrumentSerif-Regular.ttf';
const STORE_PARAMS = 'afterhour.tool.params.v1';
const STORE_TEXT = 'afterhour.tool.text.v1';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* unavailable */ } },
};
const $ = (s) => document.querySelector(s);

// ---- State ------------------------------------------------------------------

const params = defaults();
try { Object.assign(params, JSON.parse(store.get(STORE_PARAMS) || '{}')); } catch { /* ignore */ }
let text = store.get(STORE_TEXT) ?? DEFAULT_TEXT;

let last = null; // last render result { d, artboard, stats }
let fontName = 'Instrument Serif';

const save = () => {
  store.set(STORE_PARAMS, JSON.stringify(params));
  store.set(STORE_TEXT, text);
};

// ---- Worker -----------------------------------------------------------------

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let fontReady = false;
let inflight = 0; // id of the render in flight, 0 = none
let dirty = false;
let nextId = 1;

worker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'font') {
    if (msg.ok) {
      fontReady = true;
      fontName = msg.name;
      $('#font-name').textContent = msg.name;
      setStatus('');
      requestRender();
    } else {
      setStatus(`Font could not be read: ${msg.error}`);
    }
    return;
  }
  if (msg.id !== inflight) return;
  inflight = 0;
  if (msg.type === 'error') setStatus(`Render failed: ${msg.error}`);
  else applyResult(msg);
  if (playing) tickPlay();
  if (dirty) { dirty = false; requestRender(); }
};

function requestRender() {
  if (!fontReady) return;
  if (inflight) { dirty = true; return; }
  inflight = nextId++;
  worker.postMessage({ type: 'render', id: inflight, text, params: { ...params } });
}

async function loadFontBuffer(buffer) {
  fontReady = false;
  worker.postMessage({ type: 'font', buffer }, [buffer]);
}

async function loadDefaultFont() {
  const res = await fetch(DEFAULT_FONT_URL);
  await loadFontBuffer(await res.arrayBuffer());
  $('#font-reset').hidden = true;
}

// ---- Preview ----------------------------------------------------------------

const art = $('#art');
const ink = $('#art-ink');
const paper = $('#art-paper');

function applyResult(msg) {
  last = msg;
  const { width, height } = msg.artboard;
  art.setAttribute('viewBox', `0 0 ${width} ${height}`);
  paper.setAttribute('width', width);
  paper.setAttribute('height', height);
  ink.setAttribute('d', msg.d);
  const s = msg.stats;
  const kb = (buildSvgString().length / 1024).toFixed(1);
  $('#stats').textContent =
    `${s.touched}/${s.glyphs} glyphs wet · ${s.drops} drops · ${s.trails} trails · ${s.nodes} nodes · ${kb} KB · ${s.ms.toFixed(0)} ms`;
  if (s.failures) setStatus(`${s.failures} boolean operation(s) skipped on this frame.`);
}

function applyColours() {
  ink.style.fill = params.ink;
  paper.style.fill = params.paper;
}

function setStatus(t) { $('#status').textContent = t; }

// ---- Sidebar ----------------------------------------------------------------

const controls = new Map();

function fmt(v, step) {
  const dec = step >= 1 ? 0 : Math.min(3, (String(step).split('.')[1] || '').length);
  return Number(v).toFixed(dec);
}

function buildSidebar() {
  const root = $('#controls');
  const groups = new Map();
  for (const p of schema) {
    if (p.key === 'time') continue; // lives in the timeline
    if (!groups.has(p.group)) {
      const det = document.createElement('details');
      det.className = 'group';
      det.open = ['Type', 'Rain', 'Lens'].includes(p.group);
      const sum = document.createElement('summary');
      sum.textContent = p.group;
      const rows = document.createElement('div');
      rows.className = 'rows';
      det.append(sum, rows);
      root.append(det);
      groups.set(p.group, rows);
    }
    groups.get(p.group).append(buildRow(p));
  }
}

function buildRow(p) {
  const row = document.createElement('div');
  row.className = 'row';
  const id = `p-${p.key}`;
  const name = document.createElement('label');
  name.className = 'name';
  name.textContent = p.label;
  name.htmlFor = id;
  row.append(name);

  const commit = (v) => {
    params[p.key] = v;
    if (p.key === 'ink' || p.key === 'paper') applyColours(); else requestRender();
    save();
  };

  if (p.type === 'bool') {
    row.classList.add('wide');
    const cb = Object.assign(document.createElement('input'), { type: 'checkbox', id });
    cb.addEventListener('change', () => commit(cb.checked));
    row.append(cb);
    controls.set(p.key, { sync: () => { cb.checked = !!params[p.key]; } });
  } else if (p.type === 'select') {
    row.classList.add('wide');
    const sel = Object.assign(document.createElement('select'), { id });
    for (const o of p.options) sel.append(new Option(o, o));
    sel.addEventListener('change', () => commit(sel.value));
    row.append(sel);
    controls.set(p.key, { sync: () => { sel.value = params[p.key]; } });
  } else if (p.type === 'color') {
    row.classList.add('wide');
    const c = Object.assign(document.createElement('input'), { type: 'color', id });
    c.addEventListener('input', () => commit(c.value.toUpperCase()));
    row.append(c);
    controls.set(p.key, { sync: () => { c.value = params[p.key]; } });
  } else if (p.type === 'seed') {
    row.classList.add('wide');
    const wrap = document.createElement('div');
    wrap.className = 'seed';
    const n = Object.assign(document.createElement('input'), { type: 'number', id, min: 0, max: 4294967295, step: 1 });
    const dice = Object.assign(document.createElement('button'), { type: 'button', textContent: 'New', title: 'New seed (R)' });
    n.addEventListener('change', () => commit(Math.max(0, Math.floor(Number(n.value) || 0))));
    dice.addEventListener('click', () => { reseed(); });
    wrap.append(n, dice);
    row.append(wrap);
    controls.set(p.key, { sync: () => { n.value = params[p.key]; } });
  } else {
    const range = Object.assign(document.createElement('input'), { type: 'range', min: p.min, max: p.max, step: p.step, id });
    const box = Object.assign(document.createElement('input'), { type: 'number', min: p.min, max: p.max, step: p.step });
    box.setAttribute('aria-label', p.label);
    range.addEventListener('input', () => { box.value = fmt(range.value, p.step); commit(Number(range.value)); });
    box.addEventListener('change', () => {
      const v = Math.min(p.max, Math.max(p.min, Number(box.value)));
      if (!Number.isFinite(v)) return;
      range.value = v;
      box.value = fmt(v, p.step);
      commit(v);
    });
    row.append(range, box);
    controls.set(p.key, { sync: () => { range.value = params[p.key]; box.value = fmt(params[p.key], p.step); } });
  }
  return row;
}

function syncControls() {
  for (const c of controls.values()) c.sync();
  syncTime();
}

function reseed() {
  params.seed = (Math.random() * 2 ** 32) >>> 0;
  controls.get('seed').sync();
  save();
  requestRender();
}

// ---- Timeline ---------------------------------------------------------------

const timeEl = $('#time');
const timeOut = $('#time-out');
const timeSpec = schema.find((p) => p.key === 'time');
timeEl.max = timeSpec.max;
timeEl.step = STEP;

function syncTime() {
  timeEl.value = params.time;
  timeOut.textContent = `${params.time.toFixed(2)} s`;
}

function setTime(t, { render = true } = {}) {
  params.time = Math.min(timeSpec.max, Math.max(0, Math.round(t / STEP) * STEP));
  syncTime();
  if (render) requestRender();
}

timeEl.addEventListener('input', () => { setTime(Number(timeEl.value)); save(); });
$('#btn-back').addEventListener('click', () => setTime(params.time - STEP));
$('#btn-fwd').addEventListener('click', () => setTime(params.time + STEP));

let playing = false;
let playClock = 0;
function setPlaying(v) {
  playing = v;
  const b = $('#btn-play');
  b.setAttribute('aria-pressed', String(v));
  b.textContent = v ? 'Pause' : 'Play';
  if (v) {
    if (params.time >= timeSpec.max - STEP) setTime(0, { render: false });
    playClock = performance.now();
    requestRender();
  } else {
    save();
  }
}
/** Advance by real elapsed time after each finished frame (frame rate adapts to compute cost). */
function tickPlay() {
  const now = performance.now();
  const dt = Math.min(0.25, (now - playClock) / 1000);
  playClock = now;
  if (params.time + dt >= timeSpec.max) { setTime(timeSpec.max); setPlaying(false); return; }
  setTime(params.time + dt);
}
$('#btn-play').addEventListener('click', () => setPlaying(!playing));

// ---- Text & font -----------------------------------------------------------

const textEl = $('#text');
textEl.value = text;
textEl.addEventListener('input', () => {
  text = textEl.value;
  save();
  requestRender();
});

$('#font-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  setStatus(`Loading ${file.name}…`);
  await loadFontBuffer(await file.arrayBuffer());
  $('#font-reset').hidden = false;
});
$('#font-reset').addEventListener('click', () => loadDefaultFont());

// ---- Export -----------------------------------------------------------------

function buildSvgString() {
  if (!last) return '';
  return buildSvg(last.d, last.artboard, {
    ink: params.ink,
    paper: params.paper,
    background: params.exportBackground,
    title: `${text.replace(/\n/g, ' ')} — Afterhour, seed ${params.seed}, t=${params.time.toFixed(2)}s`,
  });
}

function fileStem() {
  const slug = text.trim().split('\n')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'afterhour';
  return `${slug}-s${params.seed}-t${params.time.toFixed(2).replace('.', '_')}`;
}

function exportSvg() {
  const svg = buildSvgString();
  if (!svg) return;
  download(new Blob([svg], { type: 'image/svg+xml' }), `${fileStem()}.svg`);
  setStatus('SVG exported.');
}

$('#btn-svg').addEventListener('click', exportSvg);
$('#btn-png').addEventListener('click', async () => {
  const svg = buildSvgString();
  if (!svg) return;
  try {
    const blob = await svgToPng(svg, last.artboard.width, last.artboard.height, 2);
    download(blob, `${fileStem()}@2x.png`);
    setStatus('PNG exported.');
  } catch (err) {
    setStatus(err.message);
  }
});
$('#btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(buildSvgString());
    setStatus('SVG copied to clipboard.');
  } catch {
    setStatus('Clipboard is not available here — use Export SVG.');
  }
});
$('#btn-copy-params').addEventListener('click', async () => {
  const json = JSON.stringify({ text, font: fontName, ...params }, null, 2);
  try { await navigator.clipboard.writeText(json); setStatus('Settings copied.'); } catch { console.log(json); setStatus('Settings logged to console.'); }
});
$('#btn-reset').addEventListener('click', () => {
  Object.assign(params, defaults());
  store.del(STORE_PARAMS);
  syncControls();
  applyColours();
  requestRender();
});

// ---- Keys -------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  const inField = e.target.closest && e.target.closest('textarea, input:not([type="range"]), select');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); exportSvg(); return; }
  if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === ' ' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === 'ArrowLeft' && e.target === document.body) setTime(params.time - (e.shiftKey ? 1 : STEP));
  else if (e.key === 'ArrowRight' && e.target === document.body) setTime(params.time + (e.shiftKey ? 1 : STEP));
  else if (e.key === 'r' || e.key === 'R') reseed();
});

// ---- Start ------------------------------------------------------------------

buildSidebar();
syncControls();
applyColours();
setStatus('Loading font…');
loadDefaultFont().catch((err) => setStatus(`Could not load the default font: ${err.message}`));

window.__afterhour = { params, get last() { return last; }, setTime, requestRender, exportSvgString: buildSvgString };
