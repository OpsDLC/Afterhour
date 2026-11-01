import { searchFonts, type CatalogFont } from '../fonts/catalog';
import { loadGoogleFont, previewFamily } from '../fonts/google';
import { loadLocalFont } from '../fonts/local';
import { getFontState, subscribe, switchFont } from '../fonts/state';
import { initCombobox } from './combobox';

const search = document.getElementById('font-search') as HTMLInputElement;
const list = document.getElementById('font-list') as HTMLUListElement;
const current = document.getElementById('font-current')!;
const error = document.getElementById('font-error')!;
const fileInput = document.getElementById('font-file') as HTMLInputElement;

function uploadFile(file: File): void {
  void switchFont(file.name, () => loadLocalFont(file));
}

const SOURCE_LABEL = { google: 'Google Fonts', system: 'system font', local: 'uploaded file' };

const fontOf = new WeakMap<Element, CatalogFont>();

export function initFontPanel(): void {
  // Names are drawn in their own typeface only once they scroll into view.
  const seen = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) continue;
        const el = target as HTMLElement;
        const font = fontOf.get(el)!;
        const family = font.source === 'system' ? font.family : previewFamily(font);
        el.style.fontFamily = `"${family}", var(--ui-font)`;
        seen.unobserve(el);
      }
    },
    { root: list },
  );

  initCombobox<CatalogFont>({
    input: search,
    list,
    search: searchFonts,
    renderItem: (font, li) => {
      const name = document.createElement('span');
      name.textContent = font.family;
      fontOf.set(name, font);
      const category = document.createElement('small');
      category.textContent = font.category;
      li.append(name, category);
      seen.observe(name);
    },
    onSelect: (font) =>
      void switchFont(font.family, async () =>
        font.source === 'system'
          ? { name: font.family, family: font.family, source: 'system', weights: font.weights }
          : loadGoogleFont(font),
      ),
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) uploadFile(file);
    fileInput.value = '';
  });

  // Dropping a font file anywhere on the tool loads it.
  const app = document.getElementById('app')!;
  app.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    app.classList.add('dropping');
  });
  app.addEventListener('dragleave', (e) => {
    if (!app.contains(e.relatedTarget as Node)) app.classList.remove('dropping');
  });
  app.addEventListener('drop', (e) => {
    e.preventDefault();
    app.classList.remove('dropping');
    const file = e.dataTransfer?.files[0];
    if (file) uploadFile(file);
  });

  const show = () => {
    const { current: font, loading, error: message } = getFontState();
    current.textContent = loading
      ? `Loading ${loading}…`
      : `${font.name} · ${SOURCE_LABEL[font.source]}`;
    error.hidden = !message;
    error.textContent = message ?? '';
  };
  subscribe(show);
  show();
}
