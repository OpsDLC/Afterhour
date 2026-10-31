// The actual font file behind the current font (H4N-28), as a plain SFNT (TrueType/CFF), so its
// outlines can be rained. Everything stays in the browser.
import { getLocalFontFile } from './local.ts';
import { fontKind, woffToSfnt } from './sfnt.ts';
import type { FontInfo } from './state.ts';

export class FontFileUnavailable extends Error {}

const cache = new Map<string, Promise<ArrayBuffer>>();

/** Any font container → plain SFNT. WOFF2 needs a Brotli decoder, loaded only when used. */
export async function toSfnt(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const kind = fontKind(buffer);
  if (kind === 'ttf' || kind === 'otf') return buffer;
  if (kind === 'woff') return woffToSfnt(buffer);
  if (kind === 'woff2') {
    const { default: decompress } = await import('woff2-encoder/decompress');
    const out = await decompress(new Uint8Array(buffer));
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  }
  throw new Error('Not a font file.');
}

export interface TtfSnapshot {
  source: string;
  /** family → weight → path under fonts.gstatic.com/s/ */
  files: Record<string, Record<string, string>>;
}

/** The snapshot is a separate chunk (~100 kB gzipped), loaded the first time a font file is needed. */
const loadSnapshot = async (): Promise<TtfSnapshot> => (await import('./google-ttf.json')).default;

/** URL of the static TTF of a Google family at the nearest available weight. */
export async function googleTtfUrl(
  family: string,
  weight: number,
  load = loadSnapshot,
): Promise<string> {
  const files = (await load()).files[family];
  if (!files) throw new FontFileUnavailable(`“${family}” is not in the Google Fonts snapshot.`);
  const weights = Object.keys(files).map(Number);
  const best = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  return `https://fonts.gstatic.com/s/${files[String(best)]}`;
}

/** The font file for `info` at `weight`. Throws FontFileUnavailable for system fonts. */
export function getFontFile(info: FontInfo, weight: number): Promise<ArrayBuffer> {
  if (info.source === 'system') {
    return Promise.reject(
      new FontFileUnavailable(
        'Browsers cannot read the files of fonts installed on your computer.',
      ),
    );
  }
  const key = `${info.source}:${info.family}:${info.source === 'google' ? weight : ''}`;
  let file = cache.get(key);
  if (!file) {
    file = (async () => {
      if (info.source === 'local') {
        const raw = getLocalFontFile(info.family);
        if (!raw)
          throw new FontFileUnavailable(
            'The uploaded file is no longer in memory. Upload it again.',
          );
        return toSfnt(raw);
      }
      const res = await fetch(await googleTtfUrl(info.family, weight));
      if (!res.ok) throw new Error(`Google Fonts returned ${res.status} for “${info.name}”.`);
      return res.arrayBuffer();
    })();
    file.catch(() => cache.delete(key));
    cache.set(key, file);
  }
  return file;
}
