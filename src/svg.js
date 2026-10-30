// SVG document assembly and PNG rasterisation.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param d     path data of all outlines (non-zero fill)
 * @param size  { width, height } of the artboard (px)
 * @param opts  { ink, paper, background, title }
 */
export function buildSvg(d, { width, height }, { ink, paper, background = false, title = 'Afterhour' } = {}) {
  const w = Math.round(width * 100) / 100;
  const h = Math.round(height * 100) / 100;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<title>${esc(title)}</title>`,
    background ? `<rect width="${w}" height="${h}" fill="${esc(paper)}"/>` : '',
    `<path fill="${esc(ink)}" fill-rule="nonzero" d="${d}"/>`,
    '</svg>',
  ].join('');
}

/** Rasterise an SVG string to a PNG blob at `scale`. Browser only. */
export function svgToPng(svg, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(width * scale);
      c.height = Math.round(height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not rasterise SVG')); };
    img.src = url;
  });
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
