# Afterhour

A 2D glyph tool. Night-rain drops land on your letterforms and reshape the **outlines themselves**:
each drop is a lens that magnifies (and, like a real water drop, inverts) the contour beneath it;
drops gather, merge, slide, and their wet trails stretch the strokes they cross.
The result is plain vector geometry — export it as SVG (or PNG) and keep working in any design tool.

No effects, no overlays, no decoration: the only thing that changes is the glyph shape.

## Run locally

Static files, no build step, no dependencies to install:

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>.

## Using it

- **Text** — type in the sidebar; new lines are new lines.
- **Font** — Instrument Serif is built in. *Load font…* takes any TTF / OTF / WOFF (WOFF2 not yet).
  Everything stays in the browser.
- **Rain toolbar** (right) — every property of the rain: seed, rate, aim, coverage limits, drop size
  distribution, lens magnification / inversion / edge falloff, merging and sliding behaviour, trails.
- **Timeline** (bottom) — the rain is deterministic: the same seed + settings + time always gives the
  same outlines. Scrub, step frame by frame, or play.
- **Export** — *Export SVG* (one compound path, non-zero fill, optional background), *PNG* (2×),
  *Copy SVG*. *Copy settings* puts the full parameter set on the clipboard so a result can be reproduced.

Keys: `Space` play/pause · `←/→` one frame (`Shift` = 1 s) · `R` new seed · `⌘/Ctrl+E` export SVG.

## How the outlines are made

1. **Layout** — opentype.js lays out the text (kerning, tracking, alignment) and gives each glyph's
   outline in px.
2. **Rain** — `src/sim.js` replays the rain from t = 0 at 60 steps/s with a seeded PRNG: drops land
   (aimed at the glyphs' ink box), merge on contact (area-preserving), creep → pause → slide once
   larger than *Slides at*, lose mass and leave residue drops and trails.
3. **Trails** — a continuous 1-D warp across each wet band: strokes are widened by up to *Magnify*
   at the trail's centre line, fading to identity at its edges and over *Fade* seconds.
4. **Drops** — for every drop footprint (an ellipse; sliding drops stretch):
   the dry outline outside it is kept (boolean difference); inside it, the outline found under a
   larger source ellipse is mapped radially into the drop — magnified at the core, compressed over the
   rim (*Edge falloff*, *Edge compression*), and turned 180° when *Invert* is on.
5. **Output** — glyphs the rain didn't touch keep their **original font curves**. Touched contours are
   fitted back to cubic Béziers (Schneider's algorithm, corners kept sharp) within *Fit tolerance*,
   or exported as polylines.

The heavy work runs in a Web Worker, so the toolbar stays responsive.

## Tests

```bash
npm test
```

Node's built-in runner: simulation (merging, slide cycle, coverage cap, determinism), lens profile
maths, trail warp monotonicity, glyph holes, Bézier fit accuracy, untouched glyphs = original
outlines, engine determinism, SVG structure.

## Layout

```
index.html, styles.css   tool shell
src/main.js              UI: sidebar (generated from params), timeline, export
src/worker.js            runs the engine off the main thread
src/engine.js            layout cache + deterministic rain replay + compose
src/params.js            every adjustable value (single source of truth)
src/sim.js               rain simulation (DOM-free)
src/lens.js              drop lens + trail warp maths
src/compose.js           applies the rain to glyph polygons (boolean ops)
src/geometry.js          flattening, polygons, Bézier fitting, path data
src/font.js              font parsing + text layout
src/svg.js               SVG document, PNG rasterisation, download
src/vendor/              opentype.js 1.3.4, polygon-clipping 0.15.7 (MIT, see LICENSES.md)
assets/fonts/            Instrument Serif (SIL OFL)
docs/                    sprint log, tuning values, deployment plan
```

Deployed only as a static site (GitHub Pages) — nothing is published without Yunhan's approval.
