# Performance and mobile feasibility (H4N-5)

## How to measure

Open `/?bench` on the device. The page holds the drop count at 50, 100, 200, 400 and 800
(1 s warm-up + 4 s each, no merging, ~5 % of drops large enough to slide and leave trails) and prints
a table in the top-left overlay. The same data is in `window.__afterhourBench`.
`/?stats` shows live numbers during normal play.

- **frame / fps**: the real interval between frames (includes GPU raster and compositing).
- **work**: JavaScript time spent in simulation + issuing draw calls (CPU side only).

## Results so far (headless Chromium in the cloud sandbox, 2026-10-30)

This environment has **no GPU**: Chromium rasterises with SwiftShader (software), so the fps column is
a worst case and not representative of real hardware. The **work** column is meaningful.

Desktop viewport 1440×900 @2×:

| drops | fps | frame ms | p95 ms | work ms |
| ---: | ---: | ---: | ---: | ---: |
| 50 | 59.8 | 16.7 | 16.8 | 0.54 |
| 100 | 44.6 | 22.4 | 33.4 | 0.94 |
| 200 | 22.1 | 45.3 | 66.6 | 1.76 |
| 400 | 11.7 | 85.4 | 116.6 | 3.40 |
| 800 | 5.9 | 168.7 | 200.0 | 6.44 |

Phone viewport 390×844 @3× (capped at 2×) with **4× CPU throttling** (a rough stand-in for a
mid-range phone CPU; still software raster):

| drops | fps | frame ms | p95 ms | work ms |
| ---: | ---: | ---: | ---: | ---: |
| 50 | 38.7 | 25.9 | 33.4 | 2.56 |
| 100 | 23.5 | 42.6 | 50.1 | 5.21 |
| 200 | 10.5 | 94.8 | 133.3 | 11.6 |
| 400 | 5.2 | 193.1 | 233.4 | 21.1 |
| 800 | 3.0 | 337.0 | 400.0 | 37.3 |

Typical counts in normal play with default settings: **80–140 drops, ~10 trails**
(the coverage cap keeps total drop area ≤ 25 % of the text block in the first 5 s, ≤ 45 % after).

**Still needed:** the same `/?bench` run on a real desktop browser with a GPU and on at least one real
mid-range phone (e.g. Pixel 6a / iPhone 12 class). Record the table here.

## Where the cost is

- Each drop = 1 clip + 1 `drawImage` (source-rect only, so the GPU samples just the lens area) + 1 sprite
  `drawImage` for ring/highlight. Ring/highlight gradients are pre-rendered once into a sprite.
- Each trail = one clipped `drawImage` per 10 trail points. Trails are the most expensive element per
  pixel; they fade by easing magnification to 1× and are skipped entirely once invisible.
- CPU work is linear in drops (merge test uses a uniform grid, O(n)).

## Safeguards already in place

- **Auto quality** (on by default): if more than half the frames over 2 s take > 22 ms, the max pixel
  ratio drops by 0.25 (floor 1.0). It never goes back up within a session, so it cannot oscillate.
  Caveat: iOS Low Power Mode caps at 30 fps and will trigger it; the floor keeps text acceptable.
- **Max pixel ratio** slider (default 2).
- **Coverage cap** bounds drop count in practice.

## Recommendation: Canvas 2D — GO (conditional)

Canvas 2D is the right call for the MVP: the JS side is cheap (< 2 ms at 200 drops on desktop CPU),
the draw pattern (clipped `drawImage`) is GPU-accelerated in every current browser, and typical scenes
stay near 100 drops.

Switch to the **2D shader fallback** (WebGL2, still no 3D engine) only if a real mid-range phone shows
< 50 fps at 150 drops after auto quality settles. The fallback would be one full-screen fragment pass
sampling the text texture, with drops packed into a small data texture (x, y, rx, ry, magnification)
and trails accumulated in a low-resolution "wetness" render target — cost becomes O(pixels) instead
of O(drops × lens area). The simulation (`src/sim.js`) is renderer-agnostic and would be reused as is.
