# Rain audio input — permissions and privacy (H4N-4)

## What the audio does

| Feature (per animation frame) | How it is measured | Drives |
| --- | --- | --- |
| Loudness | RMS of the time-domain signal, adaptive range (AGC) | drop count (`audioRate`) and size (`sizeMul`) |
| Rhythm / hits | spectral flux, 0.8–9 kHz, adaptive threshold (mean + 1.6σ over ~0.75 s), ≥ 70 ms apart | bursts of medium drops (`onsetBurst`) |
| Low frequency | band energy 30–250 Hz, AGC | slide probability and speed (`lowSlide`) |
| High frequency | band energy 4–12 kHz, AGC | fine small drops (`fineRate`) |

Only these four numbers leave the analyser. No samples are kept, nothing is written to storage,
nothing is sent over the network. There is no speech recognition.

Verified in headless Chromium with a synthetic rain file (quiet 6 s, then loud with hits):
drops spawned per second went from ~30 to 41–51 when the audio got loud.

## Microphone

- Requested only after the user chooses **Microphone** *and* confirms an in-page explanation dialog
  (what is analysed, that nothing is recorded/uploaded, that a browser prompt follows).
- `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`
  — voice-call processing is switched off because it treats rain as noise to remove.
- The mic is never connected to the speakers (no feedback, no playback).
- Choosing any other source stops every track, so the browser's recording indicator turns off.
- Requires a secure context: works on `https://` (GitHub Pages) and `http://localhost`.
- Error messages cover: declined permission, no device, insecure page, unsupported browser.

## Audio file

- `<input type="file" accept="audio/*">`; played from a local object URL, looped, through the speakers
  (the user chose it). The object URL is revoked when the source changes.
- The file never leaves the device.

## Risks to verify (to be verified on real devices)

1. **iOS Safari**: the AudioContext must be resumed from a user gesture — we create/resume it inside
   the click handler. Needs a check on a real iPhone, including the silent switch (file playback is
   muted by the ringer switch on iOS; analysis still works).
2. **Permission persistence**: browsers may remember "allow" for the origin. Users can revoke it in
   site settings; the About dialog should keep saying so.
3. **Opt-in audio in exports**: a recording with mic audio can capture voices in the room. Off by
   default, never remembered between exports, labelled with that risk.
4. **Bluetooth headsets**: opening the mic can switch some headsets to the low-quality call profile.
   Worth a note in the about copy if testers hit it.
5. **Background tabs**: analysis stops with `requestAnimationFrame`; the file is paused when the
   piece is paused.
