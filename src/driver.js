// Maps audio features to rain behaviour (H4N-4):
//   loudness → drop count and size, onsets (rhythm) → timing bursts,
//   low frequency → slide probability and speed, high frequency → fine small drops.
// Also produces simulated "fake rain" features so the piece works without audio.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothNoise(t, seed) {
  return (
    Math.sin(t * 0.21 + seed) * 0.5 +
    Math.sin(t * 0.53 + seed * 2.1) * 0.3 +
    Math.sin(t * 1.37 + seed * 3.7) * 0.2
  ) * 0.5 + 0.5;
}

export class RainDriver {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.t = 0;
    this.level = 0;
    this.low = 0;
    this.high = 0;
  }

  /** Fake night-rain features: slow gusts with random drop hits. */
  simulate(dt) {
    this.t += dt;
    const gust = smoothNoise(this.t, 1.3);
    const level = clamp01(0.25 + 0.6 * gust + (this.rand() - 0.5) * 0.1);
    const hitRate = 1.5 + 4 * level;
    return {
      level,
      low: clamp01(gust * gust * 1.2 - 0.2),
      high: clamp01(0.3 + 0.4 * smoothNoise(this.t * 1.7, 4.2)),
      onset: this.rand() < hitRate * dt ? 1 + this.rand() : 0,
      active: true,
    };
  }

  /** Turn features into simulation drive values. `source` is 'simulated' | 'mic' | 'file' | 'still'. */
  drive(f, p, dt, source) {
    if (source === 'still' || !f || !f.active) {
      return { baseMul: source === 'still' ? 0 : 1, rate: 0, fine: 0, burst: 0, slideBoost: 0, sizeMul: 1 };
    }
    const g = p.audioGain;
    // Fast attack, slower release, like the ear hears rain.
    const ease = (cur, v, up, down) => cur + (v - cur) * Math.min(1, dt * (v > cur ? up : down));
    this.level = ease(this.level, clamp01(f.level * g), 12, 3);
    this.low = ease(this.low, clamp01(f.low * g), 6, 1.5);
    this.high = ease(this.high, clamp01(f.high * g), 10, 3);
    const audio = source !== 'simulated';
    return {
      baseMul: audio ? 0.1 : 0.4,
      rate: p.audioRate * this.level ** 1.3,
      fine: p.fineRate * this.high ** 1.5,
      burst: f.onset > 0 ? Math.round(p.onsetBurst * Math.min(1, f.onset / 1.5)) : 0,
      slideBoost: this.low,
      sizeMul: 0.85 + 0.35 * this.level,
    };
  }
}
