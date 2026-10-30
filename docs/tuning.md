# Droplet tuning (H4N-9)

Starting values come from the Creative Director tuning spec. All values are live in the **Tune**
panel (`T`); **Copy values** puts the full JSON on the clipboard so a session can be recorded here.
Sizes are diameters in letter heights **H** (H = cap height of the rendered type, 0.7 × font size).

## Recorded values (v0.2, first pass — still to be signed off by the Creative Director)

| Area | Spec | Implemented default | Notes |
| --- | --- | --- | --- |
| Small drops | 0.3–0.6 H, 1.3× | `smallMin 0.3`, `smallMax 0.6`, `magSmall 1.3` | 70 % of spawns |
| Medium drops | 0.8–1.2 H, 1.6× | `mediumMin 0.8`, `mediumMax 1.2`, `magMedium 1.6` | 25 % of spawns |
| Large drops | up to 1.8 H, 2× | `largeMax 1.8`, `magLarge 2.0` | 5 % of spawns; magnification interpolates between anchors (0.45 / 1.0 / 1.8 H) |
| Edge falloff | 15 % | `edgeFalloff 0.15` | lens fades into the ring over the outer 15 % of the radius |
| Dark ring | ~35 % opacity | `ringOpacity 0.35` | background colour, never black |
| Highlight | upper-left | `highlight 0.55` | amber, small (0.2 R) — the only amber besides splashes |
| Creep | 0.1 H/s | `creepSpeed 0.1`, `creepTime 0.8 s` | |
| Pause | 0.3 s | `pauseTime 0.3` | |
| Slide | 2–4 H/s | `slideMin 2`, `slideMax 4` | eased in over ~0.3 s; bigger drops a little faster (√size) |
| Slide trigger | "once large enough" | `slideAt 1.3 H` | just above the medium range, so merges are what make drops slide |
| Trail width | 15–25 % of diameter | `trailWidth 0.2` | |
| Trail text | 1.1× | `trailMag 1.1` | horizontal only (a vertical water film is a cylinder lens) |
| Trail fade | 4–6 s | `trailFade 5` | fades by easing magnification to 1×, plus `trailSheen 0.04` |
| First 5 s | total drop area < 25 % of text area | `introCoverage 0.25` | unit-tested; steady state `maxCoverage 0.45` |

Extra behaviour not in the spec, all tunable:

- **Merge** when centres are closer than 0.92 × (r₁ + r₂); area is conserved; merged drops wobble briefly.
  A sliding drop that hits a resting one carries it along.
- **Mass loss** while sliding: `massLoss 0.018` of area per H travelled, plus residue drops
  (`residue 0.12` per H). Sliding drops stop again below 55 % of `slideAt`.
- **Wander**: damped sideways random walk (`wander 0.25`), bounded relative to fall speed.
- **Evaporation**: `0.04 H/min` — very slow, keeps the screen from saturating over long sessions.
- **Splash glow**: amber, 0.45 s, `splash 0.5`.

## Reduced motion

When the OS asks for reduced motion (or the panel toggle is on): spawn rate 1.5/s, slides at 35 %
speed, no splash glow, audio bursts off, fewer audio-driven drops.
