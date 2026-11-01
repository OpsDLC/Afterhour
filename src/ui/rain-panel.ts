import { getFontState, subscribe } from '../fonts/state';
import { inkMaps, RainSim, renderFusion, renderLens } from '../rain/index.ts';
import type { FrameMessage, ToWorker, View } from '../rain/worker';
import type { Settings } from '../settings';
import { getZoom, setLabelExtra } from './artboard';
import { visualLines } from './text-lines';

// H4N-39: the first slice of the Rain tab. While the tab is open, rain falls on the artboard.
// The type is rasterised from the live DOM layout, so line breaks, alignment and tracking match.

const panel = document.getElementById('tp-rain')!;
const board = document.getElementById('artboard')!;
const text = document.getElementById('preview-text')!;
const amount = document.getElementById('rain-amount') as HTMLInputElement;
const amountOut = document.querySelector<HTMLOutputElement>('output[for="rain-amount"]')!;
const seedInput = document.getElementById('rain-seed') as HTMLInputElement;
const reseed = document.getElementById('rain-reseed')!;
const play = document.getElementById('rain-play')!;
const restart = document.getElementById('rain-restart')!;
const clock = document.getElementById('rain-clock') as HTMLOutputElement;
const dropsOut = document.getElementById('rain-drops') as HTMLOutputElement;
const samples = Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.view-sample'));
const viewRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="rain-view"]'),
);

const canvas = document.createElement('canvas');
canvas.className = 'rain-canvas';
canvas.setAttribute('aria-hidden', 'true');
board.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

const worker = new Worker(new URL('../rain/worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);

const grouped = new Intl.NumberFormat('en-GB');

/** 12.4 s → "00:12" + ".4" (the tenth is set lighter). */
function setClock(t: number): void {
  const tenths = Math.floor(t * 10);
  const m = Math.floor(tenths / 600),
    sec = Math.floor(tenths / 10) % 60;
  clock.innerHTML = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}<span>.${tenths % 10}</span>`;
}

/**
 * The view tiles show "Aa" in the current font, rained on by the real engine (fixed seed), so the
 * choice is made by looking at the result. Small enough to render on the main thread.
 */
function renderSamples(family: string, weight: number): void {
  const [first] = samples;
  if (!first) return;
  const W = first.width,
    H = first.height;
  const off = new OffscreenCanvas(W, H);
  const c = off.getContext('2d')!;
  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#000';
  c.font = `${weight} 112px "${family}", serif`;
  c.textAlign = 'center';
  c.fillText('Aa', W / 2, H * 0.74);
  const page = { width: W, height: H, rgba: c.getImageData(0, 0, W, H).data };
  const sim = new RainSim({ width: W, height: H, seed: 4 });
  let t = 0;
  for (let i = 0; i < 170; i++) sim.step(1 / 30, 0.6, (t += 1 / 30));
  const maps = inkMaps(page);
  for (const canvas of samples) {
    const out = new Uint8ClampedArray(W * H * 4);
    if (canvas.dataset.view === 'lens') renderLens(sim, page, t, out);
    else renderFusion(sim, maps, t, out);
    canvas.getContext('2d')!.putImageData(new ImageData(out, W, H), 0, 0);
  }
}

/** True while the user is typing text (radios, sliders and buttons don't count). */
const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLInputElement && /^(text|number|search|email|url|password)$/.test(el.type)));

export function initRainPanel(settings: Settings): { pageChanged: () => void } {
  let active = false;
  let playing = true;
  let busy = false;
  let pageDirty = true;
  let size = { w: 0, h: 0 };
  let last = 0;
  let view: View = 'lens';
  let seed = Number(seedInput.value) || 11;

  const intensity = () => Number(amount.value) / 100;
  const label = () =>
    setLabelExtra(
      active
        ? `seed ${seed}  ·  rain ${amount.value}  ·  ${view === 'lens' ? 'Lens' : 'Fusion'}`
        : '',
    );

  /** Draws the visible text into an artboard-sized white page, one line at a time. */
  function rasterise(): void {
    const w = settings.artboardWidth,
      h = settings.artboardHeight;
    const off = new OffscreenCanvas(w, h);
    const c = off.getContext('2d')!;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, w, h);
    const lines = visualLines(text);
    if (lines.length) {
      const { family } = getFontState().current;
      c.font = `${settings.fontWeight} ${settings.fontSize}px "${family}"`;
      c.letterSpacing = `${settings.letterSpacing * settings.fontSize}px`;
      c.fillStyle = '#000';
      c.textBaseline = 'alphabetic';
      const ascent = c.measureText('Hg').fontBoundingBoxAscent;
      const origin = board.getBoundingClientRect(),
        z = getZoom();
      for (const l of lines) {
        c.fillText(l.text, (l.left - origin.left) / z, (l.top - origin.top) / z + ascent);
      }
    }
    const rgba = c.getImageData(0, 0, w, h).data;
    send({ type: 'page', width: w, height: h, rgba }, [rgba.buffer]);
  }

  function reset(): void {
    size = { w: settings.artboardWidth, h: settings.artboardHeight };
    canvas.width = size.w;
    canvas.height = size.h;
    send({ type: 'reset', width: size.w, height: size.h, seed });
    pageDirty = true;
  }

  worker.onmessage = (e: MessageEvent<FrameMessage | { type: 'frame'; rgba: null }>) => {
    busy = false;
    const m = e.data;
    if (!m.rgba || !active) return;
    if (m.width === canvas.width && m.height === canvas.height) {
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(m.rgba.buffer as ArrayBuffer), m.width, m.height),
        0,
        0,
      );
      board.classList.add('raining');
    }
    setClock(m.t);
    dropsOut.value = `${grouped.format(m.drops)} drops · ${m.sliding} sliding`;
  };

  function tick(now: number): void {
    if (!active) return;
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (!busy) {
      if (settings.artboardWidth !== size.w || settings.artboardHeight !== size.h) reset();
      if (pageDirty) {
        pageDirty = false;
        rasterise();
      }
      busy = true;
      send({ type: 'frame', dt, intensity: intensity(), view, playing });
    }
    requestAnimationFrame(tick);
  }

  function setActive(on: boolean): void {
    if (on === active) return;
    active = on;
    board.classList.toggle('raining', false);
    label();
    if (on) {
      refreshSamples();
      if (!size.w) reset();
      pageDirty = true;
      last = 0;
      requestAnimationFrame(tick);
    }
  }

  const setPlaying = (on: boolean) => {
    playing = on;
    play.setAttribute('aria-pressed', String(on));
    play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    play.title = `${on ? 'Pause' : 'Play'} · K`;
  };
  const setView = (v: View) => {
    view = v;
    for (const r of viewRadios) r.checked = r.value === v;
    label();
  };
  const showAmount = () => {
    amountOut.value = amount.value;
    amount.style.setProperty('--value', `${amount.value}%`);
  };
  showAmount();
  let samplesFor = '';
  const refreshSamples = () => {
    const key = `${getFontState().current.family}|${settings.fontWeight}`;
    if (!active || key === samplesFor) return;
    samplesFor = key;
    renderSamples(getFontState().current.family, settings.fontWeight);
  };

  // the panel's hidden attribute is the tab state (tabs.ts stays generic)
  new MutationObserver(() => setActive(!panel.hidden)).observe(panel, {
    attributes: true,
    attributeFilter: ['hidden'],
  });

  amount.addEventListener('input', () => {
    showAmount();
    label();
  });
  for (const r of viewRadios) r.addEventListener('change', () => setView(r.value as View));
  const applySeed = (value: number) => {
    seed = Math.max(1, Math.min(2147483646, Math.round(value) || 1));
    seedInput.value = String(seed);
    reset();
    label();
  };
  seedInput.addEventListener('change', () => applySeed(Number(seedInput.value)));
  reseed.addEventListener('click', () => applySeed(1 + Math.floor(Math.random() * 99999)));
  play.addEventListener('click', () => setPlaying(!playing));
  restart.addEventListener('click', reset);
  // keys while the Rain tab is open: K play/pause, 1/2 view, Shift+R restart
  window.addEventListener('keydown', (e) => {
    if (!active || e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === 'k') setPlaying(!playing);
    else if (e.key === '1') setView('lens');
    else if (e.key === '2') setView('fusion');
    else if (key === 'r' && e.shiftKey) reset();
    else return;
    e.preventDefault();
  });
  subscribe(() => {
    pageDirty = true;
    refreshSamples();
  });
  void document.fonts.ready.then(() => {
    pageDirty = true;
    samplesFor = '';
    refreshSamples();
  });

  return {
    pageChanged: () => {
      pageDirty = true;
      refreshSamples();
    },
  };
}
