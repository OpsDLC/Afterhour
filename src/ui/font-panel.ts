import { googleFonts, loadGoogleFont, previewFamily, type GoogleFont } from '../fonts/google';
import { loadLocalFont } from '../fonts/local';
import { getFontState, subscribe, switchFont } from '../fonts/state';
import { initCombobox } from './combobox';

const search = document.getElementById('font-search') as HTMLInputElement;
const list = document.getElementById('font-list') as HTMLUListElement;
const current = document.getElementById('font-current')!;
const error = document.getElementById('font-error')!;
const fileInput = document.getElementById('font-file') as HTMLInputElement;

function matches(fonts: GoogleFont[], query: string): GoogleFont[] {
  const q = query.toLowerCase();
  if (!q) return fonts;
  const starts = fonts.filter((f) => f.family.toLowerCase().startsWith(q));
  const contains = fonts.filter((f) => !starts.includes(f) && f.family.toLowerCase().includes(q));
  return [...starts, ...contains];
}

function uploadFile(file: File): void {
  void switchFont(file.name, () => loadLocalFont(file));
}

const fontOf = new WeakMap<Element, GoogleFont>();

export function initFontPanel(): void {
  // Names are drawn in their own typeface only once they scroll into view.
  const seen = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) continue;
        const el = target as HTMLElement;
        el.style.fontFamily = `"${previewFamily(fontOf.get(el)!)}", var(--ui-font)`;
        seen.unobserve(el);
      }
    },
    { root: list },
  );

  initCombobox<GoogleFont>({
    input: search,
    list,
    search: async (q) => matches(await googleFonts(), q),
    renderItem: (font, li) => {
      const name = document.createElement('span');
      name.textContent = font.family;
      fontOf.set(name, font);
      const category = document.createElement('small');
      category.textContent = font.category;
      li.append(name, category);
      seen.observe(name);
    },
    onSelect: (font) => void switchFont(font.family, () => loadGoogleFont(font)),
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
      : `${font.name} · ${font.source === 'google' ? 'Google Fonts' : 'uploaded file'}`;
    error.hidden = !message;
    error.textContent = message ?? '';
  };
  subscribe(show);
  show();
}
