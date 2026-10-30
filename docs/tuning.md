# Rain tuning values (H4N-9)

Starting values from the Creative Director tuning spec, now applied to glyph outlines instead of
pixels. All are live in the sidebar; **Copy settings** exports the full set as JSON.
Sizes are drop diameters in letter heights **H** (cap height of the set type).

| Area | Spec | Default | How it acts on the outline |
| --- | --- | --- | --- |
| Small drops | 0.3–0.6 H, 1.3× | `smallMin 0.3`, `smallMax 0.6`, `magSmall 1.3` | 70 % of drops |
| Medium drops | 0.8–1.2 H, 1.6× | `mediumMin 0.8`, `mediumMax 1.2`, `magMedium 1.6` | 25 % |
| Large drops | up to 1.8 H, 2× | `largeMax 1.8`, `magLarge 2.0` | 5 %; magnification interpolates between anchors (0.45 / 1.0 / 1.8 H) |
| Edge falloff | 15 % | `edgeFalloff 0.15` | outer 15 % of the drop radius compresses the contour toward the rim |
| Edge compression | — | `edgeGain 1.0` | how much extra outline the rim pulls in; higher = more slivers along the rim |
| Dark ring / highlight | ~35 % / upper-left | — | dropped: nothing but glyph geometry is drawn |
| Inversion | real drop | `flip true` | the contour inside a drop is turned 180° |
| Creep | 0.1 H/s | `creepSpeed 0.1`, `creepTime 0.8` | |
| Pause | 0.3 s | `pauseTime 0.3` | |
| Slide | 2–4 H/s | `slideMin 2`, `slideMax 4` | |
| Slide trigger | "once large enough" | `slideAt 1.3` | merging is what makes most drops slide |
| Trail width | 15–25 % of diameter | `trailWidth 0.2` | |
| Trail text | 1.1× | `trailMag 1.1` | horizontal stroke widening, continuous outline |
| Trail fade | 4–6 s | `trailFade 5` | widening eases back to 1× |
| First 5 s | drop area < 25 % of text area | `introCoverage 0.25` | unit-tested; afterwards `maxCoverage 0.4` |

Output defaults: `fitTolerance 0.25 px` (Bézier fit), `flatten 1 px` (sampling before warping).
