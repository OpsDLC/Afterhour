import './style.css';
import { loadGoogleFont } from './fonts/google';
import { getFontState, switchFont } from './fonts/state';
import { createHistory, type History } from './history';
import { render } from './render';
import {
  applyAuto,
  DEFAULT_SETTINGS,
  DEFAULT_TEXT,
  nearestWeight,
  type Settings,
} from './settings';
import { initArtboard, refreshRulers } from './ui/artboard';
import { initFontPanel } from './ui/font-panel';
import { initLayoutControls } from './ui/layout-controls';
import { initSquintView, updateMeasure } from './ui/measure';
import { initPreviewGestures } from './ui/preview-gestures';
import { initRainPanel } from './ui/rain-panel';
import { initTabs } from './ui/tabs';
import { initTypeControls } from './ui/type-controls';

const app = document.getElementById('app')!;
const toggle = document.getElementById('panel-toggle')!;
const show = document.getElementById('panel-show')!;

const settings: Settings = { ...DEFAULT_SETTINGS };
const textInput = document.getElementById('text-input') as HTMLTextAreaElement;
let rain: { pageChanged: () => void } | null = null;
const update = () => {
  render(textInput.value, settings);
  updateMeasure(settings);
  refreshRulers();
  rain?.pageChanged();
};
textInput.value = DEFAULT_TEXT;
textInput.addEventListener('input', update);

// Every settings change goes through here: AUTO values follow the size, then panel and preview.
let syncControls: (() => void)[] = [];
let history: History<Settings> | null = null;
const syncAll = () => {
  applyAuto(settings);
  for (const sync of syncControls) sync();
  update();
  history?.record({ ...settings });
};

initFontPanel();
syncControls = [
  initTypeControls(settings, syncAll),
  initLayoutControls(settings, syncAll),
  initArtboard(settings, syncAll),
];
initSquintView();
rain = initRainPanel(settings);
syncAll();
history = createHistory<Settings>({ ...settings });
new ResizeObserver(() => updateMeasure(settings)).observe(
  document.getElementById('preview-block')!,
);

// Reset restores every setting (the text stays), keeping the weight valid for the current font.
document.getElementById('reset')!.addEventListener('click', () => {
  Object.assign(settings, DEFAULT_SETTINGS);
  settings.fontWeight = nearestWeight(getFontState().current.weights, settings.fontWeight);
  syncAll();
});

// Undo / redo every setting (H4N-42): ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y.
// Inside text fields the browser's own undo applies.
const typingText = (el: EventTarget | null) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLElement && el.isContentEditable) ||
  (el instanceof HTMLInputElement && /^(text|number|search)$/.test(el.type));
window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || typingText(e.target)) return;
  const k = e.key.toLowerCase();
  const redo = (k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.metaKey);
  if (k !== 'z' && !redo) return;
  e.preventDefault();
  const state = redo ? history?.redo() : history?.undo();
  if (!state) return;
  Object.assign(settings, state);
  const h = history;
  history = null; // restoring is not a new change
  syncAll();
  history = h;
});

initPreviewGestures({
  settings,
  changed: syncAll,
  getText: () => textInput.value,
  setText: (value) => {
    textInput.value = value;
    update();
  },
});

// Default face: EB Garamond (Yunhan, H4N-40).
void switchFont('EB Garamond', () =>
  loadGoogleFont({ family: 'EB Garamond', weights: [400, 500, 600, 700, 800] }),
);

initTabs(document.querySelector<HTMLElement>('[role="tablist"]')!);

function setPanelOpen(open: boolean): void {
  app.classList.toggle('panel-collapsed', !open);
  toggle.setAttribute('aria-expanded', String(open));
  show.hidden = open;
  (open ? toggle : show).focus();
}

toggle.addEventListener('click', () => setPanelOpen(false));
show.addEventListener('click', () => setPanelOpen(true));

document.getElementById('open-anyway')!.addEventListener('click', () => {
  document.documentElement.classList.add('force-desktop');
});
