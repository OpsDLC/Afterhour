# Research prototypes

Throwaway prototypes behind the rain decisions in [HANDOFF.md](../HANDOFF.md). Not part of the app build; kept so the decisions can be reproduced. Jira tickets in brackets.

## `rain/` — open the HTML files in a browser

| File | What it shows |
| --- | --- |
| `raster-prototype.html` | First look Yunhan liked: text deformed by crisp raster lenses, drops land/merge/slide. Params: `?rain=0..1&font=EB%20Garamond&anim=1`. (H4N-2) |
| `glass-sim.html` | **Approved rain-on-glass simulation (v9)**: adhesion threshold, drizzle feeding, trembling, snap, stops, tapering wandering trails that merge. Three views: `?view=compare` (three fusion tunings), `?view=lens`, `?view=fusion`; **V** toggles lens/fusion. Step it from the console with `frame(i, 30, total)`. (H4N-29, H4N-35) |

## `rain-font/` — Node scripts that write real fonts

Setup in a scratch folder: `npm i opentype.js@2.0.0 polygon-clipping@0.15.7`, `pip install fonttools opentype-sanitizer`, download a TTF (e.g. EB Garamond Regular from fonts.gstatic.com), `mkdir out`.

| File | What it shows | Outcome |
| --- | --- | --- |
| `vf-spike.mjs` + `build_vf.py` | Point-compatible rained masters → variable font with a custom **RAIN** axis (fontTools varLib), OTS passes, renders in Chrome | Feasible |
| `lens-continuous.mjs <font.ttf> <tag>` | Continuous lens bulges (style C+) | Rejected: "rash", not beautiful |
| `lens-crisp.mjs <font.ttf> <tag>` | Crisp boolean-cut optical drops on stroke edges | Explored |
| `paper.mjs <font.ttf> <tag>` (`RUNS=0/1`) | Rain on paper: ink bleed + blunt runs, dry/damp/wet variants | Explored, then glass chosen |
