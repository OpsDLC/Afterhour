// Licence guard (H4N-28): may a rained copy of this font be exported, and under which rules?
// The font file itself is the authority (name IDs 0, 13, 14 and OS/2 fsType); the source adds
// context (every Google Fonts family is published under an open licence).
import { NAME, readFsType, readNames } from './sfnt.ts';
import type { FontSource } from './state.ts';

export type LicenceKind = 'OFL' | 'Apache' | 'UFL' | 'unknown';

/** allowed: open licence, export after renaming · confirm: the user must accept the risk · blocked: no export */
export type Verdict = 'allowed' | 'confirm' | 'blocked';

export interface LicenceReport {
  verdict: Verdict;
  kind: LicenceKind;
  /** Plain-English lines to show before export, most important first. */
  notes: string[];
  /** Names the derived font must not use: the original family and any Reserved Font Names. */
  protectedNames: string[];
  /** Name-table text to carry into the derived font. */
  copyright: string;
  licence: string;
  licenceUrl: string;
}

const LICENCE_URL: Record<Exclude<LicenceKind, 'unknown'>, string> = {
  OFL: 'https://openfontlicense.org',
  Apache: 'https://www.apache.org/licenses/LICENSE-2.0',
  UFL: 'https://ubuntu.com/legal/font-licence',
};
const LICENCE_TEXT: Record<Exclude<LicenceKind, 'unknown'>, string> = {
  OFL: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
  Apache: 'Licensed under the Apache License, Version 2.0.',
  UFL: 'Licensed under the Ubuntu Font Licence, Version 1.0.',
};

export function licenceKind(text: string): LicenceKind {
  if (/open font licen[cs]e|\bOFL\b|scripts\.sil\.org\/OFL|openfontlicense\.org/i.test(text))
    return 'OFL';
  if (/apache licen[cs]e|apache\.org\/licenses/i.test(text)) return 'Apache';
  if (/ubuntu font licen[cs]e/i.test(text)) return 'UFL';
  return 'unknown';
}

/** Names reserved by an OFL "with Reserved Font Name(s) …" clause. */
export function reservedFontNames(copyright: string): string[] {
  const out = new Set<string>();
  for (const m of copyright.matchAll(/Reserved\s+Font\s+Names?\s*:?\s*([^.;\n]+)/gi)) {
    for (const part of m[1].split(/,|\band\b/)) {
      const name = part.replace(/["“”'‘’]/g, '').trim();
      if (name) out.add(name);
    }
  }
  return [...out];
}

/** fsType bits that matter for a derived font (OpenType spec, OS/2.fsType). */
function fsTypeNotes(fsType: number | null): { blocked: string[]; warn: string[] } {
  const blocked: string[] = [],
    warn: string[] = [];
  if (fsType === null) return { blocked, warn };
  if (fsType & 0x0200)
    blocked.push(
      'The font allows bitmap embedding only (fsType bit 9), so its outlines may not be used.',
    );
  if ((fsType & 0x000f) === 0x0002)
    warn.push(
      'The font is marked Restricted License embedding (fsType 2): the maker does not allow it to be embedded or shared.',
    );
  else if (fsType & 0x0004) warn.push('The font is marked Preview & Print embedding (fsType 4).');
  else if (fsType & 0x0008) warn.push('The font is marked Editable embedding (fsType 8).');
  if (fsType & 0x0100) warn.push('The font is marked No Subsetting (fsType bit 8).');
  return { blocked, warn };
}

/**
 * The licence report for a font. `sfnt` is the plain font file (TrueType/CFF), or null when the
 * bytes cannot be read (system fonts).
 */
export function licenceReport(
  source: FontSource,
  sfnt: ArrayBuffer | null,
  displayName: string,
): LicenceReport {
  const empty = { protectedNames: [displayName], copyright: '', licence: '', licenceUrl: '' };
  if (source === 'system' || !sfnt) {
    return {
      ...empty,
      verdict: 'blocked',
      kind: 'unknown',
      notes: [
        'Browsers cannot read the files of fonts installed on your computer, so this font cannot be rained into a font file. Upload the font file, or pick a Google font.',
      ],
    };
  }
  const names = readNames(sfnt);
  const copyright = names.get(NAME.copyright) ?? '';
  const licenceText = names.get(NAME.licence) ?? '';
  const licenceUrl = names.get(NAME.licenceUrl) ?? '';
  const family = names.get(NAME.typoFamily) ?? names.get(NAME.family) ?? displayName;
  const protectedNames = [
    ...new Set([family, displayName, ...reservedFontNames(copyright)].filter(Boolean)),
  ];
  let kind = licenceKind(`${licenceText} ${licenceUrl}`);
  const notes: string[] = [];
  const { blocked, warn } = fsTypeNotes(readFsType(sfnt));

  if (kind === 'unknown' && source === 'google') {
    kind = 'OFL'; // not stated in the file; Google Fonts publishes under open licences only
    notes.push(
      'The file does not state its licence; Google Fonts publishes only open-licensed fonts. Check the family page before publishing.',
    );
  }
  const base = {
    protectedNames,
    copyright,
    kind,
    licence: kind === 'unknown' ? licenceText : LICENCE_TEXT[kind],
    licenceUrl: kind === 'unknown' ? licenceUrl : licenceUrl || LICENCE_URL[kind],
  };

  if (blocked.length) return { ...base, verdict: 'blocked', notes: [...blocked, ...notes] };
  if (kind !== 'unknown') {
    const rename = `The rained font gets its own name: it may not be called ${protectedNames.map((n) => `“${n}”`).join(' or ')}.`;
    return {
      ...base,
      verdict: source === 'google' || !warn.length ? 'allowed' : 'confirm',
      notes: [
        `${kind === 'OFL' ? 'SIL Open Font License 1.1' : kind === 'Apache' ? 'Apache License 2.0' : 'Ubuntu Font Licence 1.0'}: modified versions may be shared under the same licence.`,
        rename,
        'The licence and copyright are copied into the new font.',
        ...warn,
        ...notes,
      ],
    };
  }
  return {
    ...base,
    verdict: 'confirm',
    notes: [
      'The licence of this font is not an open licence that Afterhour recognises. Most commercial licences do not allow modified copies. Check yours before exporting.',
      ...warn,
      ...(licenceText
        ? [`The font says: “${licenceText.slice(0, 240)}${licenceText.length > 240 ? '…' : ''}”`]
        : []),
    ],
  };
}

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Problems with a proposed name for the rained font; empty when it may be used. */
export function nameProblems(name: string, report: LicenceReport): string[] {
  const problems: string[] = [];
  const n = name.trim();
  if (!n) return ['Give the rained font a name.'];
  if (n.length > 31)
    problems.push('Keep the family name to 31 characters (older apps cut longer names).');
  if (!/^[\x20-\x7e]+$/.test(n))
    problems.push(
      'Use plain Latin letters, digits and spaces (other characters break the PostScript name).',
    );
  for (const p of report.protectedNames) {
    if (squash(p) && squash(n).includes(squash(p)))
      problems.push(`“${p}” is the original or a reserved name; the rained font must not use it.`);
  }
  return problems;
}
