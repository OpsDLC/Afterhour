# QA, accessibility and launch checklist (H4N-11)

Status key: ✅ done & verified here · 🟡 implemented, needs a real-device check · ⬜ not done

Launch requires Yunhan's explicit approval. Nothing is published by completing this list.

## Cross-browser QA

| Check | Chrome | Safari | Firefox | iOS Safari | Android Chrome |
| --- | --- | --- | --- | --- | --- |
| Renders, drops refract text | ✅ (headless) | ⬜ | ⬜ | ⬜ | ⬜ |
| Simulated rain / Still / click to drop | ✅ (headless) | ⬜ | ⬜ | ⬜ | ⬜ |
| Microphone source + explanation dialog | ✅ (fake device) | ⬜ | ⬜ | ⬜ | ⬜ |
| Audio file source | ✅ (headless) | ⬜ | ⬜ | ⬜ | ⬜ |
| Video export, no audio by default | ✅ H.264 MP4, video only | ⬜ | ⬜ WebM expected | ⬜ | ⬜ |
| Video export, audio opt-in | ✅ H.264 + Opus | ⬜ | ⬜ | ⬜ | ⬜ |
| `/?bench` numbers recorded | ✅ (software raster) | ⬜ | ⬜ | ⬜ | ⬜ |
| High-DPI text is crisp | ✅ @2× | ⬜ | ⬜ | ⬜ | ⬜ |
| Resize / rotate keeps drops in place | 🟡 | ⬜ | ⬜ | ⬜ | ⬜ |

## Accessibility

- ✅ Reduced motion: follows `prefers-reduced-motion` on first visit; toggle in Tune → Render.
  Fewer, slower drops; no splash glow.
- ✅ Pause at any time (`Space` or the Pause button). The file source pauses with it.
- ✅ Contrast: text #E8E4DC on #14161A ≈ 14.3 : 1 (WCAG AAA). UI labels at 55 % opacity ≈ 5.1 : 1 (AA).
- ✅ Keyboard: every control is a native button/input; visible focus ring; shortcuts listed in About.
  Shortcuts are ignored while typing in a field.
- ✅ Screen readers: canvas has `role="img"` and a label; the current words are mirrored in a
  visually hidden paragraph; source buttons are a labelled radio group; status messages are `aria-live`.
- ✅ Permission prompts explained before the browser asks (mic dialog).
- 🟡 Controls fade after 3.5 s idle but stay visible while anything inside has focus.
- ⬜ Screen reader pass with VoiceOver and NVDA.
- ✅ Touch targets: bottom-bar buttons are ≥ 44 px tall on coarse pointers.

## Privacy

- ✅ Audio processed on-device only (see `docs/audio-privacy.md`).
- ✅ No network requests after load: fonts self-hosted; no analytics, no CDN.
- ✅ Exports contain no original audio unless opted in per export.
- ✅ Only `localStorage` use: tuning values and the user's own words, on their device.
- ⬜ Privacy note on the page reviewed by Yunhan (current text: About dialog).

## Launch

- ⬜ H4N-7 trademark / domain collision check reviewed.
- ⬜ Copy approved (draft in `docs/copy-draft.md`).
- ⬜ Real-device performance recorded (`docs/performance.md`).
- ⬜ Pages enabled (`docs/deployment-plan.md`) — **needs Yunhan's approval**.

## Issues found (to file)

1. Firefox has no MP4 MediaRecorder → exports WebM; some social apps need MP4. Consider a note or
   an in-browser remux later.
2. iOS Low Power Mode caps at 30 fps, which triggers auto quality → lower pixel ratio. Acceptable,
   but verify text crispness.
