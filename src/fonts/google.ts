import type { FontInfo } from './state';

export interface GoogleFont {
  family: string;
  category: string;
  weights: number[];
}

const API = 'https://fonts.googleapis.com/css2';

let list: Promise<GoogleFont[]> | null = null;

/** The bundled snapshot of every Google Font (see scripts/update-google-fonts.mjs), loaded on first use. */
export function googleFonts(): Promise<GoogleFont[]> {
  list ??= import('./google-fonts.json').then((m) =>
    (m.default.fonts as [string, string, number[]][]).map(([family, category, weights]) => ({
      family,
      category,
      weights,
    })),
  );
  return list;
}

function cssUrl(family: string, weights: number[], text?: string): string {
  const spec = `${family.replace(/ /g, '+')}:wght@${weights.join(';')}`;
  return `${API}?family=${spec}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ''}`;
}

/** Loads every weight of a Google Font and resolves once the browser can render it. */
export async function loadGoogleFont(
  font: Pick<GoogleFont, 'family' | 'weights'>,
): Promise<FontInfo> {
  const href = cssUrl(font.family, font.weights);
  if (!document.querySelector(`link[href="${CSS.escape(href)}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    await new Promise<void>((resolve, reject) => {
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove();
        reject(new Error(`Could not reach Google Fonts for “${font.family}”.`));
      };
      document.head.append(link);
    });
  }
  const faces = await Promise.all(
    font.weights.map((w) => document.fonts.load(`${w} 16px "${font.family}"`)),
  );
  if (faces.every((f) => f.length === 0)) throw new Error(`“${font.family}” did not load.`);
  return { name: font.family, family: font.family, source: 'google', weights: font.weights };
}

const previewed = new Set<string>();

/**
 * Loads just the glyphs of a family's own name under a separate alias, so the picker can show
 * each name in its typeface without interfering with the real font.
 */
export function previewFamily({ family, weights }: GoogleFont): string {
  const alias = `ah-preview ${family}`;
  if (!previewed.has(family)) {
    previewed.add(family);
    const weight = weights.includes(400) ? 400 : weights[0];
    fetch(cssUrl(family, [weight], family))
      .then((r) => (r.ok ? r.text() : ''))
      .then((css) => {
        const style = document.createElement('style');
        style.textContent = css.replace(/font-family: '[^']+'/g, `font-family: '${alias}'`);
        document.head.append(style);
      })
      .catch(() => previewed.delete(family));
  }
  return alias;
}
