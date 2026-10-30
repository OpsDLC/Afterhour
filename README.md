# Afterhour

Night rain (夜雨) lands on your words, magnifies and turns them over, gathers, and slides away.

An experimental web typography piece: pure Canvas 2D, a static site, no build step, no dependencies.
Audio is analysed on-device with Web Audio; nothing is uploaded.

## Run locally

Any static file server works (ES modules need `http://`, not `file://`):

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>. The microphone needs a secure context; `localhost` counts.

Useful URL flags:

| Flag | Effect |
| --- | --- |
| `?debug` | open the tuning panel on load |
| `?stats` | frame-rate overlay |
| `?bench` | automated benchmark at 50 / 100 / 200 / 400 / 800 drops (results in the overlay and `window.__afterhourBench`) |
| `?seed=7` | deterministic rain |
| `?text=...` | words to render (newline = `%0A`) |

## Controls

Sources: **Night rain** (simulated), **Microphone**, **Audio file**, **Still** (click/tap to place drops).
Keys: `Space` pause · `T` tune panel · `E` export video · `S` stats · `C` clear · `H` hide controls · `?` about.

## Tests

```bash
npm test
```

Node's built-in test runner; covers merging (area conservation), the creep → pause → slide → exit cycle,
trail fade-out, the first-5-seconds coverage cap, magnification anchors and the audio → rain mapping.

## Layout

```
index.html, styles.css    page shell and UI chrome
src/tokens.js             colour + type tokens (single source of truth)
src/params.js             every tunable value, with defaults from the tuning spec
src/sim.js                droplet simulation (DOM-free, unit-tested)
src/renderer.js           Canvas 2D lens / trail / splash rendering
src/textTexture.js        words → off-screen texture at device resolution
src/audio.js              Web Audio analysis (loudness, onsets, low/high bands)
src/driver.js             audio features → rain behaviour; simulated rain
src/recorder.js           client-side video export (no audio by default)
src/panel.js, stats.js    tuning panel; frame stats, benchmark, auto quality
assets/fonts/             Instrument Serif (SIL OFL), self-hosted
docs/                     sprint notes, privacy, performance, tuning, deployment, QA
```

## Principles (from the epic)

- Pure 2D; no 3D engine. No glass or window is drawn — the pane is only a concept.
- Rain sound is analysed on-device. No speech recognition, no upload.
- Shared video has no original audio by default.
- Static site for GitHub Pages only. Nothing is published, registered or bought without Yunhan's approval.

See [`docs/sprints.md`](docs/sprints.md) for what is done per Jira ticket.
