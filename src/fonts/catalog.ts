import { googleFonts, type GoogleFont } from './google';

export interface CatalogFont extends GoogleFont {
  source: 'system' | 'google';
  /** Tier used for ordering (the picker shows one list, no headings). */
  group: string;
}

// Fonts graphic designers reach for first, shown before any search.
const SYSTEM = [
  ['Helvetica Neue', 'sans-serif'],
  ['Helvetica', 'sans-serif'],
  ['Arial', 'sans-serif'],
  ['Futura', 'sans-serif'],
  ['Gill Sans', 'sans-serif'],
  ['Georgia', 'serif'],
  ['Times New Roman', 'serif'],
  ['Baskerville', 'serif'],
  ['Garamond', 'serif'],
  ['Courier New', 'monospace'],
  ['Menlo', 'monospace'],
  ['Consolas', 'monospace'],
];

const PICKS = [
  'EB Garamond',
  'Cormorant Garamond',
  'Libre Baskerville',
  'Playfair Display',
  'Fraunces',
  'Instrument Serif',
  'Newsreader',
  'Inter',
  'Work Sans',
  'DM Sans',
  'Space Grotesk',
  'Arimo',
  'IBM Plex Sans',
  'IBM Plex Mono',
  'JetBrains Mono',
  'Space Mono',
];

const SYSTEM_GROUP = 'On this computer';
const PICKS_GROUP = 'Designer picks · Google Fonts';
const ALL_GROUP = 'All Google Fonts';

/** True when `family` is installed: text set in it measures differently from every fallback. */
function installed(family: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const sample = 'mmmmmmmmmmlliWW@#0';
  return ['monospace', 'serif', 'sans-serif'].every((fallback) => {
    ctx.font = `72px ${fallback}`;
    const base = ctx.measureText(sample).width;
    ctx.font = `72px "${family}", ${fallback}`;
    return ctx.measureText(sample).width !== base;
  });
}

let catalog: Promise<{ featured: CatalogFont[]; all: CatalogFont[] }> | null = null;

function load() {
  catalog ??= googleFonts().then((fonts) => {
    const system: CatalogFont[] = SYSTEM.filter(([family]) => installed(family)).map(
      ([family, category]) => ({
        family,
        category,
        // Weights of local fonts can't be read from the page; the browser synthesises bold.
        weights: [400, 700],
        source: 'system',
        group: SYSTEM_GROUP,
      }),
    );
    const picks: CatalogFont[] = PICKS.flatMap((name) => {
      const font = fonts.find((f) => f.family === name);
      return font ? [{ ...font, source: 'google' as const, group: PICKS_GROUP }] : [];
    });
    const all: CatalogFont[] = fonts
      .filter((f) => !PICKS.includes(f.family))
      .map((f) => ({ ...f, source: 'google' as const, group: ALL_GROUP }));
    return { featured: [...system, ...picks], all };
  });
  return catalog;
}

// Handwriting last, then display; text faces (serif, sans, mono) first.
const categoryRank = (f: CatalogFont) =>
  f.category === 'handwriting' ? 2 : f.category === 'display' ? 1 : 0;

/**
 * With no query: designer picks, then every Google Font. With a query: matches across all
 * fonts, designer picks first, then names starting with the query; handwriting always last.
 */
export async function searchFonts(query: string): Promise<CatalogFont[]> {
  const { featured, all } = await load();
  const q = query.toLowerCase();
  if (!q) return [...featured, ...[...all].sort((a, b) => categoryRank(a) - categoryRank(b))];

  const rank = (f: CatalogFont) => {
    const name = f.family.toLowerCase();
    const at = name.indexOf(q);
    if (at < 0) return -1;
    return categoryRank(f) * 4 + (f.group === ALL_GROUP ? 2 : 0) + (at === 0 ? 0 : 1);
  };
  return [...featured, ...all]
    .map((f) => ({ f, r: rank(f) }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r)
    .map(({ f }) => f);
}
