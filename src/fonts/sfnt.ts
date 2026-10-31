// Small, dependency-free readers for font files (H4N-28). Pure: no DOM, so they run in tests.

export type FontKind = 'ttf' | 'otf' | 'woff' | 'woff2';

const SIGNATURES: Record<string, FontKind> = {
  '\x00\x01\x00\x00': 'ttf',
  true: 'ttf',
  OTTO: 'otf',
  wOFF: 'woff',
  wOF2: 'woff2',
};

const tag = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

/** The container format from the first four bytes, or null if it is not a font. */
export function fontKind(buffer: ArrayBuffer): FontKind | null {
  if (buffer.byteLength < 12) return null;
  return SIGNATURES[tag(new Uint8Array(buffer), 0)] ?? null;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** WOFF 1 → plain SFNT (TrueType/CFF), table by table (zlib). */
export async function woffToSfnt(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const view = new DataView(buffer),
    src = new Uint8Array(buffer);
  const flavor = view.getUint32(4),
    count = view.getUint16(12);
  const tables: { tag: string; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    const at = 44 + i * 20;
    const offset = view.getUint32(at + 4),
      compLength = view.getUint32(at + 8),
      origLength = view.getUint32(at + 12);
    const raw = src.subarray(offset, offset + compLength);
    const data = compLength === origLength ? raw.slice() : await inflate(raw);
    if (data.length !== origLength) throw new Error('Damaged WOFF table');
    tables.push({ tag: tag(src, at), checksum: view.getUint32(at + 16), data });
  }
  return buildSfnt(flavor, tables);
}

/** Assembles an SFNT from tables (sorted by tag, 4-byte aligned). Table checksums are kept as given. */
export function buildSfnt(
  flavor: number,
  tables: { tag: string; checksum: number; data: Uint8Array }[],
): ArrayBuffer {
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const n = sorted.length;
  let pow = 1,
    log = 0;
  while (pow * 2 <= n) {
    pow *= 2;
    log++;
  }
  let size = 12 + 16 * n;
  const offsets = sorted.map((t) => {
    const o = size;
    size += (t.data.length + 3) & ~3;
    return o;
  });
  const out = new Uint8Array(size),
    view = new DataView(out.buffer);
  view.setUint32(0, flavor);
  view.setUint16(4, n);
  view.setUint16(6, pow * 16);
  view.setUint16(8, log);
  view.setUint16(10, n * 16 - pow * 16);
  sorted.forEach((t, i) => {
    const at = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[at + k] = t.tag.charCodeAt(k);
    view.setUint32(at + 4, t.checksum);
    view.setUint32(at + 8, offsets[i]);
    view.setUint32(at + 12, t.data.length);
    out.set(t.data, offsets[i]);
  });
  return out.buffer;
}

/** One table of a plain SFNT, or null. */
export function sfntTable(buffer: ArrayBuffer, name: string): DataView | null {
  const view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    if (tag(bytes, at) === name)
      return new DataView(buffer, view.getUint32(at + 8), view.getUint32(at + 12));
  }
  return null;
}

/** name ID → string, preferring Windows Unicode English, then any Windows, then Mac Roman. */
export function readNames(buffer: ArrayBuffer): Map<number, string> {
  const t = sfntTable(buffer, 'name');
  const names = new Map<number, string>();
  if (!t) return names;
  const count = t.getUint16(2),
    strings = t.getUint16(4);
  const rank = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const platform = t.getUint16(at),
      encoding = t.getUint16(at + 2),
      language = t.getUint16(at + 4);
    const id = t.getUint16(at + 6),
      length = t.getUint16(at + 8),
      offset = t.getUint16(at + 10);
    let value: string, score: number;
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      value = '';
      for (let k = 0; k < length; k += 2)
        value += String.fromCharCode(t.getUint16(strings + offset + k));
      score = language === 0x409 ? 3 : 2;
    } else if (platform === 1 && encoding === 0) {
      value = '';
      for (let k = 0; k < length; k++)
        value += String.fromCharCode(t.getUint8(strings + offset + k));
      score = 1;
    } else continue;
    if (score > (rank.get(id) ?? 0)) {
      names.set(id, value);
      rank.set(id, score);
    }
  }
  return names;
}

/** OS/2 fsType (embedding permissions), or null when there is no OS/2 table. */
export function readFsType(buffer: ArrayBuffer): number | null {
  const t = sfntTable(buffer, 'OS/2');
  return t && t.byteLength >= 10 ? t.getUint16(8) : null;
}

export const NAME = {
  copyright: 0,
  family: 1,
  subfamily: 2,
  fullName: 4,
  version: 5,
  postscript: 6,
  trademark: 7,
  manufacturer: 8,
  designer: 9,
  licence: 13,
  licenceUrl: 14,
  typoFamily: 16,
} as const;
