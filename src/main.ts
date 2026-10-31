import './style.css';
import { loadGoogleFont } from './fonts/google';
import { getFontState, switchFont } from './fonts/state';
import { render } from './render';
import {
  applyAuto,
  DEFAULT_SETTINGS,
  DEFAULT_TEXT,
  nearestWeight,
  type Settings,
} from './settings';
import { initFontPanel } from './ui/font-panel';
import { initLayoutControls } from './ui/layout-controls';
import { initSquint, updateMeasure } from './ui/measure';
import { initPreviewGestures } from './ui/preview-gestures';
import { initTabs } from './ui/tabs';
import { initTypeControls } from './ui/type-controls';

const app = document.getElementById('app')!;
const toggle = document.getElementById('panel-toggle')!;
const show = document.getElementById('panel-show')!;

const settings: Settings = { ...DEFAULT_SETTINGS };
const textInput = document.getElementById('text-input') as HTMLTextAreaElement;
const update = () => {
  render(textInput.value, settings);
  updateMeasure(settings);
};
textInput.value = DEFAULT_TEXT;
textInput.addEventListener('input', update);

// Every settings change goes through here: AUTO values follow the size, then panel and preview.
let syncControls: (() => void)[] = [];
const syncAll = () => {
  applyAuto(settings);
  for (const sync of syncControls) sync();
  update();
};

initFontPanel();
syncControls = [initTypeControls(settings, syncAll), initLayoutControls(settings, syncAll)];
initSquint();
syncAll();
new ResizeObserver(() => updateMeasure(settings)).observe(
  document.getElementById('preview-block')!,
);

// Reset restores every setting (the text stays), keeping the weight valid for the current font.
document.getElementById('reset')!.addEventListener('click', () => {
  Object.assign(settings, DEFAULT_SETTINGS);
  settings.fontWeight = nearestWeight(getFontState().current.weights, settings.fontWeight);
  syncAll();
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

void switchFont('Instrument Serif', () =>
  loadGoogleFont({ family: 'Instrument Serif', weights: [400] }),
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
