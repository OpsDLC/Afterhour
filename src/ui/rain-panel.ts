import { getFontState, subscribe } from '../fonts/state';
import type { FrameMessage, ToWorker, View } from '../rain/worker';
import type { Settings } from '../settings';
import { getZoom, setLabelExtra } from './artboard';

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
    const node = text.firstChild;
    if (node && node.nodeType === Node.TEXT_NODE && !text.classList.contains('is-empty')) {
      const str = node.textContent ?? '';
      const { family } = getFontState().current;
      c.font = `${settings.fontWeight} ${settings.fontSize}px "${family}"`;
      c.letterSpacing = `${settings.letterSpacing * settings.fontSize}px`;
      c.fillStyle = '#000';
      c.textBaseline = 'alphabetic';
      const ascent = c.measureText('Hg').fontBoundingBoxAscent;
      const origin = board.getBoundingClientRect(),
        z = getZoom();
      const range = document.createRange();
      // group characters into visual lines by their box top
      let line: { top: number; left: number; from: number; to: number } | null = null;
      const flush = () => {
        if (!line) return;
        c.fillText(
          str.slice(line.from, line.to),
          (line.left - origin.left) / z,
          (line.top - origin.top) / z + ascent,
        );
        line = null;
      };
      for (let i = 0; i < str.length; i++) {
        if (str[i] === '\n') {
          flush();
          continue;
        }
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getClientRects()[0];
        if (!r) continue;
        if (line && Math.abs(r.top - line.top) < 1) line.to = i + 1;
        else {
          flush();
          line = { top: r.top, left: r.left, from: i, to: i + 1 };
        }
      }
      flush();
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
    clock.value = `${m.t.toFixed(1)} s  ·  ${m.drops} drops`;
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
      if (!size.w) reset();
      pageDirty = true;
      last = 0;
      requestAnimationFrame(tick);
    }
  }

  const setPlaying = (on: boolean) => {
    playing = on;
    play.setAttribute('aria-pressed', String(on));
    play.textContent = on ? 'Pause' : 'Play';
  };

  // the panel's hidden attribute is the tab state (tabs.ts stays generic)
  new MutationObserver(() => setActive(!panel.hidden)).observe(panel, {
    attributes: true,
    attributeFilter: ['hidden'],
  });

  amount.addEventListener('input', () => {
    amountOut.value = amount.value;
    label();
  });
  for (const r of viewRadios)
    r.addEventListener('change', () => {
      view = r.value as View;
      label();
    });
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
  window.addEventListener('keydown', (e) => {
    if (
      !active ||
      e.key.toLowerCase() !== 'k' ||
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      typing(e.target)
    )
      return;
    e.preventDefault();
    setPlaying(!playing);
  });
  subscribe(() => (pageDirty = true));
  void document.fonts.ready.then(() => (pageDirty = true));

  return { pageChanged: () => (pageDirty = true) };
}
