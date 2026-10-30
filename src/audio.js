// On-device rain audio analysis with Web Audio (H4N-4). Nothing is uploaded and no
// speech recognition is used: we only read loudness and band energies per frame.
//
// Sources: live microphone, or a local audio file (played via an object URL).

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Adaptive range tracker so quiet and loud recordings both use the full 0..1 range. */
class Agc {
  constructor(spanDb = 18) {
    this.floor = null;
    this.peak = null;
    this.spanDb = spanDb;
  }
  push(db, dt) {
    if (!Number.isFinite(db)) db = -120;
    if (this.floor === null) { this.floor = db - 3; this.peak = db + 3; }
    // Floor follows quickly downward and slowly upward; peak the opposite.
    this.floor = db < this.floor ? this.floor + (db - this.floor) * Math.min(1, dt * 4) : this.floor + (db - this.floor) * dt * 0.05;
    this.peak = db > this.peak ? this.peak + (db - this.peak) * Math.min(1, dt * 8) : this.peak + (db - this.peak) * dt * 0.08;
    const span = Math.max(this.spanDb, this.peak - this.floor);
    return clamp01((db - this.floor) / span);
  }
}

export class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.analyser = null;
    this.mode = 'none'; // 'none' | 'mic' | 'file'
    this.stream = null;
    this.audioEl = null;
    this.source = null;
    this.monitor = null; // gain to speakers (file playback only)
    this.recordDest = null; // for opt-in audio in video export
    this.features = { level: 0, low: 0, high: 0, onset: 0, active: false };
    this.levelAgc = new Agc(20);
    this.lowAgc = new Agc(18);
    this.highAgc = new Agc(18);
    this.fluxHistory = [];
    this.lastOnset = 0;
    this.prevMag = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      this.timeBuf = new Float32Array(this.analyser.fftSize);
      this.freqBuf = new Float32Array(this.analyser.frequencyBinCount);
      this.prevMag = new Float32Array(this.analyser.frequencyBinCount);
      this.recordDest = this.ctx.createMediaStreamDestination();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async useMicrophone() {
    this.ensureContext();
    const stream = await navigator.mediaDevices.getUserMedia({
      // Rain is "noise": turn the voice-call processing off so it is not filtered away.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    this.stop();
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.source.connect(this.recordDest);
    // The mic is never routed to the speakers (no feedback, nothing played back).
    this.mode = 'mic';
    this.reset();
    this.emit();
  }

  async useFile(file) {
    this.ensureContext();
    this.stop();
    const el = new Audio();
    el.src = URL.createObjectURL(file);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    this.audioEl = el;
    this.source = this.ctx.createMediaElementSource(el);
    this.monitor = this.ctx.createGain();
    this.monitor.gain.value = 1;
    this.source.connect(this.analyser);
    this.source.connect(this.monitor);
    this.source.connect(this.recordDest);
    this.monitor.connect(this.ctx.destination);
    await el.play();
    this.mode = 'file';
    this.fileName = file.name;
    this.reset();
    this.emit();
  }

  setMonitor(on) {
    if (this.monitor) this.monitor.gain.value = on ? 1 : 0;
  }

  stop() {
    if (this.source) { try { this.source.disconnect(); } catch { /* already disconnected */ } }
    if (this.monitor) { try { this.monitor.disconnect(); } catch { /* ignore */ } }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.audioEl) {
      this.audioEl.pause();
      URL.revokeObjectURL(this.audioEl.src);
    }
    this.stream = null;
    this.audioEl = null;
    this.source = null;
    this.monitor = null;
    this.mode = 'none';
    this.features = { level: 0, low: 0, high: 0, onset: 0, active: false };
    this.emit();
  }

  /** Paused when the page is paused, so a file does not keep playing silently in the background. */
  setPaused(paused) {
    if (this.audioEl) { if (paused) this.audioEl.pause(); else this.audioEl.play().catch(() => {}); }
  }

  reset() {
    this.levelAgc = new Agc(20);
    this.lowAgc = new Agc(18);
    this.highAgc = new Agc(18);
    this.fluxHistory = [];
    this.prevMag.fill(0);
  }

  emit() {
    this.dispatchEvent(new Event('change'));
  }

  /** The audio track for opt-in export, or null. */
  audioTrack() {
    if (this.mode === 'none' || !this.recordDest) return null;
    return this.recordDest.stream.getAudioTracks()[0] || null;
  }

  /** Analyse the current frame. Returns { level, low, high, onset (0..n strength), active }. */
  analyse(dt) {
    if (this.mode === 'none' || !this.analyser) return this.features;
    const a = this.analyser;
    a.getFloatTimeDomainData(this.timeBuf);
    a.getFloatFrequencyData(this.freqBuf);

    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) sum += this.timeBuf[i] * this.timeBuf[i];
    const rmsDb = 10 * Math.log10(sum / this.timeBuf.length + 1e-12);

    const binHz = this.ctx.sampleRate / a.fftSize;
    const band = (lo, hi) => {
      const i0 = Math.max(1, Math.floor(lo / binHz));
      const i1 = Math.min(this.freqBuf.length - 1, Math.ceil(hi / binHz));
      let e = 0;
      for (let i = i0; i <= i1; i++) e += 10 ** (this.freqBuf[i] / 10);
      return 10 * Math.log10(e / (i1 - i0 + 1) + 1e-12);
    };
    const lowDb = band(30, 250);
    const highDb = band(4000, 12000);

    // Spectral flux over the band where individual drop impacts live.
    const i0 = Math.floor(800 / binHz);
    const i1 = Math.min(this.freqBuf.length - 1, Math.ceil(9000 / binHz));
    let flux = 0;
    for (let i = i0; i <= i1; i++) {
      const m = 10 ** (this.freqBuf[i] / 20);
      const diff = m - this.prevMag[i];
      if (diff > 0) flux += diff;
      this.prevMag[i] = m;
    }
    const hist = this.fluxHistory;
    hist.push(flux);
    if (hist.length > 45) hist.shift();
    let mean = 0;
    for (const v of hist) mean += v;
    mean /= hist.length;
    let varc = 0;
    for (const v of hist) varc += (v - mean) ** 2;
    const sd = Math.sqrt(varc / hist.length);
    const threshold = mean + sd * 1.6 + 1e-6;
    const now = this.ctx.currentTime;
    let onset = 0;
    if (hist.length > 10 && flux > threshold && now - this.lastOnset > 0.07) {
      onset = Math.min(3, flux / threshold);
      this.lastOnset = now;
    }

    this.features = {
      level: this.levelAgc.push(rmsDb, dt),
      low: this.lowAgc.push(lowDb, dt),
      high: this.highAgc.push(highDb, dt),
      onset,
      active: true,
      rmsDb,
    };
    return this.features;
  }
}
