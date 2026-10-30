# Sprint log

Epic: [H4N-1 Afterhour](https://yunhanhuanghan.atlassian.net/browse/H4N-1)

## Direction change (2026-10-30)

The first MVP drew drops *over* rendered text (raster lens, glow, video export). Yunhan rejected it:
Afterhour is a **2D glyph tool** — the rain must change the glyph outlines and the product is
exportable SVG; no decoration, a toolbar for the rain's properties. Rebuilt accordingly.

Removed: pixel renderer, splash glow, highlight/ring sprites, audio input, video export.
Kept: the rain simulation (now deterministic per seed) and the Creative Director's tuning values.

## Status per ticket

| Ticket | Status in the rebuild |
| --- | --- |
| H4N-2 Droplet refraction prototype | Done as vector: drops magnify/invert the outline; slides + trails reshape strokes; toolbar is the debug panel |
| H4N-3 Visual tokens & type | Instrument Serif built in (TTF for outlines); default ink #E8E4DC on #14161A; custom fonts loadable |
| H4N-4 Rain audio spike | **Paused** — removed with the pivot; could return as "drive the rain from a recording" |
| H4N-5 Performance | ~30–230 ms per frame in a worker (headless Chromium) — fine for an editing tool; play mode adapts |
| H4N-9 Merge / slide polish | Values applied to geometry, all tunable (`docs/tuning.md`) |
| H4N-10 Video export | **Superseded** by SVG / PNG export; could return as an SVG frame sequence |
| H4N-11 QA / a11y | To redo for the tool UI |
| H4N-6 Pages plan | Still valid (`docs/deployment-plan.md`) |

## Next

1. Creative Director pass on the defaults with real type.
2. Export an SVG frame sequence (zip) for animation in other tools.
3. Variable-font axes and WOFF2 input.
4. Faster compose during playback (cache untouched glyph polygons per frame, clip only changed drops).
