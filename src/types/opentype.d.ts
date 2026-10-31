// Minimal types for the parts of opentype.js 2.0 that Afterhour uses (the package ships none).
declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export class Path {
    commands: PathCommand[];
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
    quadTo(x1: number, y1: number, x: number, y: number): void;
    close(): void;
  }
  export class Glyph {
    constructor(options: { name: string; unicode?: number; advanceWidth: number; path: Path });
    name: string | null;
    unicode?: number;
    advanceWidth?: number;
    path: Path;
    getPath(x?: number, y?: number, fontSize?: number): Path;
  }
  export class Font {
    constructor(options: Record<string, unknown>);
    unitsPerEm: number;
    ascender: number;
    descender: number;
    numGlyphs: number;
    glyphs: { length: number; get(index: number): Glyph };
    names: Record<string, Record<string, string>>;
    tables: Record<string, unknown>;
    charToGlyph(char: string): Glyph;
    toArrayBuffer(): ArrayBuffer;
  }
  export function parse(buffer: ArrayBuffer): Font;
  const opentype: {
    Font: typeof Font;
    Glyph: typeof Glyph;
    Path: typeof Path;
    parse: typeof parse;
  };
  export default opentype;
}

declare module 'woff2-encoder/decompress' {
  export default function decompress(buffer: ArrayBuffer | Uint8Array): Promise<Uint8Array>;
}
