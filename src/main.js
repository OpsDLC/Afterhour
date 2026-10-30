import { applyCssTokens, font } from './tokens.js';
import { defaults, reducedMotionOverrides } from './params.js';
import { RainSim, mulberry32 } from './sim.js';
import { Renderer } from './renderer.js';
import { renderTextTexture } from './textTexture.js';
import { AudioEngine } from './audio.js';
import { RainDriver } from './driver.js';
import { buildPanel } from './panel.js';
import { FrameStats, Benchmark, AutoQuality } from './stats.js';
import { canRecord, pickMimeType, recordCanvas, downloadBlob } from './recorder.js';

const DEFAULT_WORDS = [
  'the rain kept the city awake',
  'and every word I didn’t send',
  'gathered in the dark, grew heavy,',
  'and let go',
].join('\n');

const STORE_PARAMS = 'afterhour.params.v1';
const STORE_WORDS = 'afterhour.words.v1';

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, v); } catch { /* storage unavailable */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } },
};

const $ = (sel) => document.querySelector(sel);
const query = new URLSearchParams(location.search);

applyCssTokens();

// ---- State ------------------------------------------------------------------

const params = defaults();
const saved = store.get(STORE_PARAMS);
let hasSavedParams = false;
if (saved) {
  try { Object.assign(params, JSON.parse(saved)); hasSavedParams = true; } catch { /* ignore corrupt */ }
}
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)');
if (!hasSavedParams && prefersReduced.matches) params.reducedMotion = true;
if (query.has('stats') || query.has('bench')) params.stats = true;

let effective = { ...params };
function updateEffective() {
  effective = params.reducedMotion ? { ...params, ...reducedMotionOverrides } : { ...params };
}
updateEffective();

let words = query.get('text') || store.get(STORE_WORDS) || DEFAULT_WORDS;
const seed = query.has('seed') ? Number(query.get('seed')) : (Math.random() * 2 ** 32) >>> 0;
const rand = mulberry32(seed);

const canvas = $('#stage');
const renderer = new Renderer(canvas);
const sim = new RainSim({ rand });
const driver = new RainDriver(rand);
const audio = new AudioEngine();
const frameStats = new FrameStats();
const autoQuality = new AutoQuality();
let source = 'simulated';
let paused = false;
let texture = null;
let bench = null;

// ---- Layout -----------------------------------------------------------------

function layout() {
  const cssW = Math.max(1, Math.round(window.innerWidth));
  const cssH = Math.max(1, Math.round(window.innerHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, params.pixelRatio);
  texture = renderTextTexture(words, cssW, cssH, dpr);
  renderer.resize(cssW, cssH, dpr);
  renderer.setTexture(texture);
  sim.setLayout({ width: cssW, height: cssH, H: texture.H, textBox: texture.textBox });
  $('#words-a11y').textContent = words;
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 120);
});

// ---- Loop -------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const frameMs = now - last;
  last = now;
  const dt = Math.min(0.1, frameMs / 1000);
  const t0 = performance.now();

  if (!paused) {
    let features = null;
    if (source === 'mic' || source === 'file') features = audio.analyse(dt);
    else if (source === 'simulated') features = driver.simulate(dt);
    const drive = driver.drive(features, effective, dt, source);
    if (bench) bench.prepare(dt);
    sim.update(dt, bench ? bench.params : effective, bench ? { baseMul: 0, rate: 0, fine: 0, burst: 0, slideBoost: 0, sizeMul: 1 } : drive);
  }
  renderer.draw(sim, effective);

  const workMs = performance.now() - t0;
  frameStats.push(frameMs);
  if (bench) {
    bench.record(frameMs, workMs);
    if (bench.done) finishBench();
  }
  if (params.stats) drawStats(workMs);
  if (params.autoQuality && !bench && !paused && !document.hidden) {
    const next = autoQuality.push(frameMs, Math.min(params.pixelRatio, window.devicePixelRatio || 1));
    if (next !== null) {
      params.pixelRatio = next;
      panelApi.sync();
      layout();
    }
  }
  requestAnimationFrame(frame);
}

const statsEl = $('#stats');
let statsTick = 0;
let lastWork = 0;
function drawStats(workMs) {
  lastWork = lastWork * 0.9 + workMs * 0.1;
  if (++statsTick % 10) return;
  const s = frameStats.summary();
  const lines = [
    `${s.fps.toFixed(0).padStart(3)} fps  ${s.avg.toFixed(1)} ms  p95 ${s.p95.toFixed(1)} ms`,
    `work ${lastWork.toFixed(2)} ms  dpr ${renderer.dpr}`,
    `${sim.drops.length} drops  ${sim.trails.length} trails  cover ${(sim.coverage() * 100).toFixed(0)}%`,
  ];
  if (bench && !bench.done) lines.push(`bench: ${bench.counts[bench.step]} drops…`);
  if (benchResults) {
    lines.push('', 'drops   fps  frame  p95   work');
    for (const r of benchResults) {
      lines.push(`${String(r.drops).padStart(5)} ${String(r.fps).padStart(5)} ${String(r.frameMs).padStart(6)} ${String(r.p95Ms).padStart(5)} ${String(r.workMs).padStart(6)}`);
    }
  }
  statsEl.textContent = lines.join('\n');
}

let benchResults = null;
function startBench() {
  sim.clear();
  setSource('still');
  bench = new Benchmark({ sim, params: effective });
}
function finishBench() {
  benchResults = bench.results;
  window.__afterhourBench = { results: benchResults, dpr: renderer.dpr, size: [renderer.cssW, renderer.cssH], ua: navigator.userAgent };
  console.log('[afterhour bench]', JSON.stringify(window.__afterhourBench));
  bench = null;
  sim.clear();
}

// ---- Sources ----------------------------------------------------------------

const statusEl = $('#source-status');
function setStatus(text) { statusEl.textContent = text; }

function markSource(name) {
  source = name;
  for (const b of document.querySelectorAll('[data-source]')) {
    b.setAttribute('aria-checked', String(b.dataset.source === name));
  }
}

async function setSource(name) {
  if (name === 'mic') {
    const ok = await askMicPermission();
    if (!ok) return;
    try {
      await audio.useMicrophone();
      markSource('mic');
      setStatus('Listening on this device. Nothing is recorded or uploaded.');
    } catch (err) {
      setStatus(micErrorText(err));
    }
    return;
  }
  if (name === 'file') {
    $('#file-input').click();
    return;
  }
  audio.stop();
  markSource(name);
  setStatus(name === 'still' ? 'Still. Click or tap to place drops.' : '');
}

function micErrorText(err) {
  if (!window.isSecureContext) return 'The microphone needs a secure (https) page.';
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser does not offer microphone input.';
  if (err && err.name === 'NotAllowedError') return 'Microphone permission was declined. You can allow it in the browser’s site settings.';
  if (err && err.name === 'NotFoundError') return 'No microphone was found.';
  return `Could not start the microphone${err && err.message ? `: ${err.message}` : '.'}`;
}

function askMicPermission() {
  const dlg = $('#mic-dialog');
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.returnValue = '';
    dlg.showModal();
  });
}

$('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    await audio.useFile(file);
    markSource('file');
    setStatus(`Playing “${file.name}” locally.`);
  } catch (err) {
    setStatus(`Could not play that file${err && err.message ? `: ${err.message}` : '.'}`);
  }
});

for (const b of document.querySelectorAll('[data-source]')) {
  b.addEventListener('click', () => setSource(b.dataset.source));
}

// ---- Interaction ------------------------------------------------------------

canvas.addEventListener('pointerdown', (e) => {
  const H = sim.layout.H;
  const diam = H * (0.8 + rand() * 0.5) * effective.sizeScale;
  sim.addDrop(e.clientX, e.clientY, diam, effective);
});

function setPaused(v) {
  paused = v;
  audio.setPaused(v);
  const b = $('#btn-pause');
  b.setAttribute('aria-pressed', String(v));
  b.textContent = v ? 'Resume' : 'Pause';
}
$('#btn-pause').addEventListener('click', () => setPaused(!paused));

const panel = $('#panel');
function togglePanel(force) {
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  $('#btn-tune').setAttribute('aria-expanded', String(open));
}
$('#btn-tune').addEventListener('click', () => togglePanel());
$('#panel-close').addEventListener('click', () => togglePanel(false));
$('#btn-about').addEventListener('click', () => $('#about-dialog').showModal());

function setStatsVisible(v) {
  params.stats = v;
  statsEl.hidden = !v;
  panelApi.sync();
}

const panelApi = buildPanel($('#panel-groups'), params, {
  onChange(key) {
    updateEffective();
    if (key === 'pixelRatio') layout();
    if (key === 'stats') statsEl.hidden = !params.stats;
    store.set(STORE_PARAMS, JSON.stringify(params));
  },
  onReset() {
    Object.assign(params, defaults());
    if (prefersReduced.matches) params.reducedMotion = true;
    store.del(STORE_PARAMS);
    updateEffective();
    panelApi.sync();
    statsEl.hidden = !params.stats;
    layout();
  },
});
statsEl.hidden = !params.stats;

const wordsEl = $('#words');
wordsEl.value = words;
let wordsTimer = 0;
wordsEl.addEventListener('input', () => {
  clearTimeout(wordsTimer);
  wordsTimer = setTimeout(() => {
    words = wordsEl.value.trim() ? wordsEl.value : DEFAULT_WORDS;
    store.set(STORE_WORDS, wordsEl.value);
    layout();
  }, 200);
});

// Idle: fade the controls so only the words and rain remain.
let idleTimer = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (panel.hidden && !document.querySelector('dialog[open]')) document.body.classList.add('idle');
  }, 3500);
}
['pointermove', 'pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
wake();

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('textarea, input, select, dialog')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case ' ':
      if (e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      setPaused(!paused);
      break;
    case 't': case 'T': togglePanel(); break;
    case 'e': case 'E': openExport(); break;
    case 's': case 'S': setStatsVisible(!params.stats); break;
    case 'c': case 'C': sim.clear(); break;
    case 'h': case 'H': document.body.classList.toggle('hide-ui'); break;
    case '?': $('#about-dialog').showModal(); break;
    case 'Escape': togglePanel(false); break;
    default: break;
  }
});

// ---- Export (H4N-10) --------------------------------------------------------

const exportDlg = $('#export-dialog');
let recording = false;
function openExport() {
  if (!canRecord(canvas)) {
    setStatus('Video export is not supported in this browser.');
    return;
  }
  const audioBox = $('#export-audio');
  const hasAudio = audio.mode !== 'none';
  audioBox.checked = false; // never carried over: opt in every time
  audioBox.disabled = !hasAudio;
  $('#export-audio-note').textContent = hasAudio
    ? '(off by default — it may contain voices or room sound)'
    : '(no audio source is active)';
  updateFormatHint();
  $('#export-progress').hidden = true;
  $('#export-start').disabled = false;
  exportDlg.showModal();
}
function updateFormatHint() {
  const type = pickMimeType($('#export-audio').checked);
  $('#export-format').textContent = type
    ? `Format: ${type.includes('mp4') ? 'MP4 (H.264)' : 'WebM — some apps may need it converted to MP4'}.`
    : 'This browser cannot record video.';
}
$('#export-audio').addEventListener('change', updateFormatHint);
$('#btn-export').addEventListener('click', openExport);
$('#export-start').addEventListener('click', async () => {
  if (recording) return;
  recording = true;
  const seconds = Number($('#export-seconds').value);
  const optIn = $('#export-audio').checked;
  const prog = $('#export-progress');
  prog.hidden = false;
  prog.value = 0;
  $('#export-start').disabled = true;
  if (paused) setPaused(false);
  try {
    const { blob, ext } = await recordCanvas(canvas, {
      seconds,
      audioTrack: optIn ? audio.audioTrack() : null,
      onProgress: (k) => { prog.value = k; },
    });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    downloadBlob(blob, `afterhour-${stamp}.${ext}`);
    setStatus(`Saved a ${seconds}s clip${optIn ? ' with original audio' : ' (no audio)'}.`);
    exportDlg.close();
  } catch (err) {
    setStatus(`Export failed${err && err.message ? `: ${err.message}` : '.'}`);
  } finally {
    recording = false;
    $('#export-start').disabled = false;
  }
});

// ---- Start ------------------------------------------------------------------

async function start() {
  try {
    await Promise.race([
      document.fonts.load(`${font.weight} 64px "Instrument Serif"`),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fall back to system serif */ }
  layout();
  // Re-render once any late font finishes loading.
  document.fonts?.ready?.then(() => layout());
  if (query.has('debug')) togglePanel(true);
  if (query.has('bench')) startBench();
  requestAnimationFrame((t) => { last = t; frame(t); });
}

window.__afterhour = { sim, params, audio, effective: () => effective, startBench, setSource, layout };
start();
