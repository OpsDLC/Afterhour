import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';
import { buildSfnt, fontKind, readFsType, readNames, sfntTable, NAME } from '../src/fonts/sfnt.ts';
import { licenceReport, nameProblems, reservedFontNames } from '../src/fonts/licence.ts';
import { googleTtfUrl, toSfnt } from '../src/fonts/binary.ts';

const { Font, Glyph, Path } = opentype;

/** A tiny real font made with opentype.js, with chosen name strings and fsType. */
function makeFont(opts: {
  family: string;
  copyright?: string;
  license?: string;
  licenseURL?: string;
  fsType?: number;
}): ArrayBuffer {
  const path = new Path();
  path.moveTo(100, 0);
  path.lineTo(400, 0);
  path.lineTo(400, 700);
  path.lineTo(100, 700);
  path.close();
  const glyphs = [
    new Glyph({ name: '.notdef', advanceWidth: 500, path: new Path() }),
    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path }),
  ];
  const font = new Font({
    familyName: opts.family,
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs,
    copyright: opts.copyright,
    license: opts.license,
    licenseURL: opts.licenseURL,
  });
  const buffer = font.toArrayBuffer();
  if (opts.fsType !== undefined) sfntTable(buffer, 'OS/2')!.setUint16(8, opts.fsType);
  return buffer;
}

/** SFNT → WOFF 1 (zlib per table), the inverse of woffToSfnt, for the round-trip test. */
function toWoff(sfnt: ArrayBuffer): ArrayBuffer {
  const v = new DataView(sfnt),
    n = v.getUint16(4);
  const tables = Array.from({ length: n }, (_, i) => {
    const at = 12 + i * 16,
      offset = v.getUint32(at + 8),
      length = v.getUint32(at + 12);
    const data = new Uint8Array(sfnt, offset, length),
      z = deflateSync(data);
    return {
      tag: new Uint8Array(sfnt, at, 4),
      checksum: v.getUint32(at + 4),
      orig: length,
      data: z.length < length ? new Uint8Array(z) : data,
    };
  });
  let size = 44 + 20 * n;
  const offsets = tables.map((t) => {
    const o = size;
    size += (t.data.length + 3) & ~3;
    return o;
  });
  const out = new Uint8Array(size),
    w = new DataView(out.buffer);
  out.set([0x77, 0x4f, 0x46, 0x46]);
  w.setUint32(4, v.getUint32(0));
  w.setUint32(8, size);
  w.setUint16(12, n);
  tables.forEach((t, i) => {
    const at = 44 + i * 20;
    out.set(t.tag, at);
    w.setUint32(at + 4, offsets[i]);
    w.setUint32(at + 8, t.data.length);
    w.setUint32(at + 12, t.orig);
    w.setUint32(at + 16, t.checksum);
    out.set(t.data, offsets[i]);
  });
  return out.buffer;
}

const OFL = 'This Font Software is licensed under the SIL Open Font License, Version 1.1.';

test('reads names and fsType from a font', () => {
  const f = makeFont({
    family: 'Test Serif',
    copyright: 'Copyright 2026 Someone',
    license: OFL,
    licenseURL: 'https://openfontlicense.org',
    fsType: 8,
  });
  assert.equal(fontKind(f), 'otf'); // opentype.js writes CFF outlines
  const names = readNames(f);
  assert.equal(names.get(NAME.family), 'Test Serif');
  assert.equal(names.get(NAME.licence), OFL);
  assert.equal(readFsType(f), 8);
});

test('WOFF unpacks to the same tables', async () => {
  const f = makeFont({ family: 'Round Trip', license: OFL });
  const woff = toWoff(f);
  assert.equal(fontKind(woff), 'woff');
  const back = await toSfnt(woff);
  for (const tag of ['name', 'OS/2', 'cmap', 'CFF ', 'head']) {
    const a = sfntTable(f, tag)!,
      b = sfntTable(back, tag)!;
    assert.deepEqual(
      new Uint8Array(b.buffer, b.byteOffset, b.byteLength),
      new Uint8Array(a.buffer, a.byteOffset, a.byteLength),
      tag,
    );
  }
  assert.equal(readNames(back).get(NAME.family), 'Round Trip');
});

test('buildSfnt writes a valid table directory', () => {
  const sfnt = buildSfnt(0x00010000, [
    { tag: 'zzzz', checksum: 1, data: new Uint8Array([1, 2, 3]) },
    { tag: 'aaaa', checksum: 2, data: new Uint8Array([9]) },
  ]);
  assert.deepEqual(
    [...new Uint8Array(sfntTable(sfnt, 'zzzz')!.buffer, sfntTable(sfnt, 'zzzz')!.byteOffset, 3)],
    [1, 2, 3],
  );
  assert.equal(new DataView(sfnt).getUint16(4), 2);
});

test('finds Reserved Font Names', () => {
  assert.deepEqual(
    reservedFontNames(
      'Copyright 2011 The ABeeZee Project Authors (https://github.com/x) with Reserved Font Name ABeeZee.',
    ),
    ['ABeeZee'],
  );
  assert.deepEqual(
    reservedFontNames('Copyright 2010 Foo, with Reserved Font Names "Source" and "Sans".'),
    ['Source', 'Sans'],
  );
  assert.deepEqual(reservedFontNames('Copyright 2022 The Instrument Serif Project Authors'), []);
});

test('OFL fonts may be rained, under a new name', () => {
  const f = makeFont({
    family: 'Garden',
    copyright: 'Copyright 2020 X, with Reserved Font Name "Garden Pro".',
    license: OFL,
  });
  const r = licenceReport('local', f, 'garden-regular');
  assert.equal(r.verdict, 'allowed');
  assert.equal(r.kind, 'OFL');
  assert.ok(r.protectedNames.includes('Garden') && r.protectedNames.includes('Garden Pro'));
  assert.match(r.licence, /Open Font License/);
  assert.deepEqual(nameProblems('Night Rain', r), []);
  assert.equal(nameProblems('Garden Rain', r).length, 1);
  assert.ok(nameProblems('gardenpro-rain', r).length >= 1);
  assert.ok(nameProblems('', r).length === 1);
  assert.ok(nameProblems('Regen über Stadt', r).length === 1);
});

test('unknown licences need confirmation; restricted ones say so', () => {
  const commercial = makeFont({
    family: 'Pricey Sans',
    license: 'This font is licensed under the Foundry EULA. Modification is not permitted.',
    fsType: 2,
  });
  const r = licenceReport('local', commercial, 'Pricey Sans');
  assert.equal(r.verdict, 'confirm');
  assert.equal(r.kind, 'unknown');
  assert.ok(r.notes.some((n) => /Restricted License/.test(n)));
  assert.ok(r.notes.some((n) => /Foundry EULA/.test(n)));
});

test('bitmap-only fonts are blocked; system fonts are blocked with a reason', () => {
  const bitmap = makeFont({ family: 'Bits', license: OFL, fsType: 0x0200 });
  assert.equal(licenceReport('local', bitmap, 'Bits').verdict, 'blocked');
  const sys = licenceReport('system', null, 'Helvetica');
  assert.equal(sys.verdict, 'blocked');
  assert.match(sys.notes[0], /cannot read/);
});

test('Google fonts without a stated licence are treated as open', () => {
  const f = makeFont({ family: 'Quiet', copyright: 'Copyright 2024 The Quiet Project Authors' });
  const r = licenceReport('google', f, 'Quiet');
  assert.equal(r.verdict, 'allowed');
  assert.ok(r.notes.some((n) => /does not state its licence/.test(n)));
});

test('resolves the static TTF of a Google family, nearest weight', async () => {
  const snapshot = JSON.parse(
    readFileSync(new URL('../src/fonts/google-ttf.json', import.meta.url), 'utf8'),
  );
  const load = async () => snapshot;
  assert.equal(Object.keys(snapshot.files).length, 1906);
  assert.match(
    await googleTtfUrl('Instrument Serif', 400, load),
    /^https:\/\/fonts\.gstatic\.com\/s\/instrumentserif\/v\d+\/.+\.ttf$/,
  );
  assert.match(await googleTtfUrl('Instrument Serif', 700, load), /instrumentserif/); // only 400 exists
  await assert.rejects(googleTtfUrl('No Such Family', 400, load));
});
