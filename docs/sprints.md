# Sprint log

Epic: [H4N-1 Afterhour](https://yunhanhuanghan.atlassian.net/browse/H4N-1)

## Sprint 1 — minimal validation

| Ticket | Status | Where |
| --- | --- | --- |
| H4N-2 2D droplet refraction text prototype | Done | `src/sim.js`, `src/renderer.js`, `src/panel.js` — drops magnify + flip text, slide off with fading trail, live sliders, runs from static files |
| H4N-3 Visual style tokens and text texture | Done | `src/tokens.js` (single source), `src/textTexture.js` (device-pixel texture), amber only in highlight/splash |
| H4N-4 Rain audio input spike | Done (desktop verified in headless Chromium) | `src/audio.js`, `src/driver.js`, `docs/audio-privacy.md` |
| H4N-5 Performance and mobile feasibility | Partly done — real-device numbers still needed | `/?bench`, `src/stats.js`, `docs/performance.md` (Canvas 2D: conditional GO) |

## Sprint 2 — pulled forward

| Ticket | Status | Where |
| --- | --- | --- |
| H4N-9 Merge, accumulation, slide-off polish | Done (values recorded, awaiting Creative Director sign-off) | `src/params.js`, `docs/tuning.md` |
| H4N-10 Shareable video export | Done (Chromium verified: H.264 MP4, no audio by default) | `src/recorder.js`, export dialog |
| H4N-11 QA, accessibility, launch checklist | In progress — automated/headless items done, real-device rows open | `docs/launch-checklist.md` |
| H4N-6 Pages deployment and domain plan | Plan written; decisions left to Yunhan | `docs/deployment-plan.md` |
| H4N-8 Positioning and copy draft | Draft written for the Product Marketer | `docs/copy-draft.md` |
| H4N-7 Trademark / domain collision check | Not started (owner: Idea Stress Test) | — |

## Next

1. Run `/?bench` on a real desktop GPU and a mid-range phone; record in `docs/performance.md`.
2. Safari / iOS pass: AudioContext resume, mic prompt, MP4 export.
3. Creative Director review of the tuning values with the Tune panel → "Copy values".
4. H4N-7, then Yunhan decides on Pages + domain.
