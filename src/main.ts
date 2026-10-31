import './style.css';
import { loadGoogleFont } from './fonts/google';
import { switchFont } from './fonts/state';
import { render } from './render';
import { DEFAULT_SETTINGS, DEFAULT_TEXT, type Settings } from './settings';
import { initFontPanel } from './ui/font-panel';
import { initTabs } from './ui/tabs';
import { initTypeControls } from './ui/type-controls';

const app = document.getElementById('app')!;
const toggle = document.getElementById('panel-toggle')!;
const show = document.getElementById('panel-show')!;

const settings: Settings = { ...DEFAULT_SETTINGS };
const textInput = document.getElementById('text-input') as HTMLTextAreaElement;
textInput.value = DEFAULT_TEXT;
textInput.addEventListener('input', () => render(textInput.value, settings));
render(textInput.value, settings);

initFontPanel();
initTypeControls(settings, () => render(textInput.value, settings));
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
