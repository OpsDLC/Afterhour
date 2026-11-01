// The visual lines of the preview text, read from the live DOM layout (wraps, alignment and
// tracking included). Used to rasterise the type for the rain and to measure it for the rulers.

export interface VisualLine {
  text: string;
  /** Screen px: the line box of its first character. */
  left: number;
  top: number;
}

export function visualLines(el: HTMLElement): VisualLine[] {
  const node = el.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE || el.classList.contains('is-empty')) return [];
  const str = node.textContent ?? '';
  const range = document.createRange();
  const lines: VisualLine[] = [];
  let line: { top: number; left: number; from: number; to: number } | null = null;
  const flush = () => {
    if (line) lines.push({ text: str.slice(line.from, line.to), left: line.left, top: line.top });
    line = null;
  };
  // group characters into visual lines by the top of their box
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') {
      flush();
      continue;
    }
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getClientRects()[0];
    if (!r) continue;
    if (line && Math.abs(r.top - line.top) < 1) line.to = i + 1;
    else {
      flush();
      line = { top: r.top, left: r.left, from: i, to: i + 1 };
    }
  }
  flush();
  return lines;
}
