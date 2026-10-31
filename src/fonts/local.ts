import type { FontInfo } from './state';

const EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
const SIGNATURES: Record<string, string> = {
  '\x00\x01\x00\x00': 'ttf',
  true: 'ttf',
  OTTO: 'otf',
  wOFF: 'woff',
  wOF2: 'woff2',
};

let counter = 0;
/** Uploaded files by CSS family, kept so the outlines can be read later (H4N-28). */
const files = new Map<string, ArrayBuffer>();

/** The bytes of an uploaded font, as uploaded (any container). */
export const getLocalFontFile = (family: string) => files.get(family);

/** Loads a font file into the page with the FontFace API. The bytes never leave the browser. */
export async function loadLocalFont(file: File): Promise<FontInfo> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONS.includes(ext)) {
    throw new Error(`“${file.name}” is not a font file. Use .ttf, .otf, .woff or .woff2.`);
  }
  const buffer = await file.arrayBuffer();
  const kind = SIGNATURES[String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)))];
  if (!kind) throw new Error(`“${file.name}” is damaged or not a real ${ext} font.`);

  const range = await weightRange(buffer, kind).catch(() => null);
  const name = file.name.replace(/\.[^.]+$/, '');
  const family = `ah-local-${++counter}`;
  const copy = buffer.slice(0); // FontFace may take ownership of the buffer
  const face = new FontFace(family, buffer, range ? { weight: range.join(' ') } : {});
  try {
    await face.load();
  } catch {
    throw new Error(`The browser could not read “${file.name}”.`);
  }
  document.fonts.add(face);
  files.set(family, copy);

  const [min, max] = range ?? [400, 400];
  const weights: number[] = [];
  for (let w = Math.ceil(min / 100) * 100; w <= max; w += 100) weights.push(w);
  return { name, family, source: 'local', weights: weights.length ? weights : [400] };
}

/**
 * Reads the weight a file provides: the wght axis range of a variable font, otherwise the
 * OS/2 weight class. Works for .ttf/.otf/.woff; .woff2 (Brotli) returns null and defaults to 400.
 */
async function weightRange(buffer: ArrayBuffer, kind: string): Promise<[number, number] | null> {
  if (kind === 'woff2') return null;
  const fvar = await readTable(buffer, kind, 'fvar');
  if (fvar) {
    const axesOffset = fvar.getUint16(4);
    const count = fvar.getUint16(8);
    const size = fvar.getUint16(10);
    for (let i = 0; i < count; i++) {
      const at = axesOffset + i * size;
      if (fvar.getUint32(at) === 0x77676874 /* 'wght' */) {
        return [fvar.getInt32(at + 4) / 65536, fvar.getInt32(at + 12) / 65536];
      }
    }
  }
  const os2 = await readTable(buffer, kind, 'OS/2');
  if (!os2) return null;
  const weight = os2.getUint16(4);
  return weight >= 1 && weight <= 1000 ? [weight, weight] : null;
}

async function readTable(buffer: ArrayBuffer, kind: string, tag: string): Promise<DataView | null> {
  const view = new DataView(buffer);
  const woff = kind === 'woff';
  const count = view.getUint16(woff ? 12 : 4);
  const start = woff ? 44 : 12;
  const entry = woff ? 20 : 16;
  for (let i = 0; i < count; i++) {
    const at = start + i * entry;
    const name = String.fromCharCode(...new Uint8Array(buffer, at, 4));
    if (name !== tag) continue;
    if (!woff) return new DataView(buffer, view.getUint32(at + 8), view.getUint32(at + 12));
    const offset = view.getUint32(at + 4);
    const compressed = view.getUint32(at + 8);
    const original = view.getUint32(at + 12);
    const bytes = new Uint8Array(buffer, offset, compressed);
    if (compressed === original) return new DataView(bytes.slice().buffer);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new DataView(await new Response(stream).arrayBuffer());
  }
  return null;
}
