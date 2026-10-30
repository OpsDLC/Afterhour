// Frame-time statistics and an automated droplet-count benchmark (H4N-5).

export class FrameStats {
  constructor(size = 120) {
    this.samples = new Float32Array(size);
    this.n = 0;
    this.i = 0;
  }
  push(ms) {
    this.samples[this.i] = ms;
    this.i = (this.i + 1) % this.samples.length;
    this.n = Math.min(this.n + 1, this.samples.length);
  }
  summary() {
    if (!this.n) return { fps: 0, avg: 0, p95: 0 };
    const arr = Array.from(this.samples.subarray(0, this.n)).sort((a, b) => a - b);
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    return { fps: 1000 / avg, avg, p95: arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))] };
  }
}

/**
 * Hold the simulation at fixed droplet counts and record frame timing at each step.
 * `api` = { sim, params, layout(), now() }. Calls `onDone(results)` when finished.
 */
export class Benchmark {
  constructor(api, { counts = [50, 100, 200, 400, 800], seconds = 4, warmup = 1 } = {}) {
    this.api = api;
    // Controlled run: no merging, so the count holds; ~5% of drops are large enough to slide.
    this.params = { ...api.params, merge: false, spawnRate: 0 };
    this.counts = counts;
    this.seconds = seconds;
    this.warmup = warmup;
    this.step = 0;
    this.t = 0;
    this.frames = [];
    this.work = [];
    this.results = [];
    this.done = false;
  }

  /** Called every frame before update; keeps the drop count at the target. */
  prepare(dt) {
    if (this.done) return;
    const { sim } = this.api;
    const params = this.params;
    const target = this.counts[this.step];
    const { width, height, H } = sim.layout;
    // Mix of sizes; a share of drops sliding so trails and lenses are both exercised.
    while (sim.drops.length < target) {
      const u = sim.rand();
      const diam = H * (u < 0.7 ? 0.3 + 0.3 * sim.rand() : u < 0.95 ? 0.8 + 0.4 * sim.rand() : 1.35 + 0.45 * sim.rand());
      // Large drops start above the text so they slide through it.
      const y = diam >= params.slideAt * H ? sim.rand() * height * 0.3 : sim.rand() * height;
      sim.addDrop(sim.rand() * width, y, diam, params, { splash: false });
    }
    while (sim.drops.length > target) sim.drops.pop();
    this.t += dt;
  }

  /** Record the frame interval (ms) and the CPU work time spent in update+draw (ms). */
  record(frameMs, workMs) {
    if (this.done) return;
    if (this.t > this.warmup) { this.frames.push(frameMs); this.work.push(workMs); }
    if (this.t >= this.warmup + this.seconds) {
      const sorted = [...this.frames].sort((a, b) => a - b);
      const avg = sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length);
      const workAvg = this.work.reduce((s, v) => s + v, 0) / Math.max(1, this.work.length);
      this.results.push({
        drops: this.counts[this.step],
        fps: +(1000 / avg).toFixed(1),
        frameMs: +avg.toFixed(2),
        p95Ms: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2),
        workMs: +workAvg.toFixed(2),
        trails: this.api.sim.trails.length,
      });
      this.step++;
      this.t = 0;
      this.frames = [];
      this.work = [];
      if (this.step >= this.counts.length) this.done = true;
    }
  }
}

/**
 * Lowers the pixel ratio when frames are consistently slow (H4N-5 safeguard).
 * Never raises it again within a session, to avoid oscillating.
 */
export class AutoQuality {
  constructor({ floor = 1, step = 0.25, window = 2 } = {}) {
    this.floor = floor;
    this.step = step;
    this.window = window;
    this.t = 0;
    this.slow = 0;
    this.frames = 0;
  }
  /** Returns a new max pixel ratio when it should drop, else null. */
  push(frameMs, current) {
    this.t += frameMs / 1000;
    this.frames++;
    if (frameMs > 22) this.slow++;
    if (this.t < this.window) return null;
    const slowShare = this.slow / this.frames;
    this.t = 0;
    this.slow = 0;
    this.frames = 0;
    if (slowShare > 0.5 && current - this.step >= this.floor) return +(current - this.step).toFixed(2);
    return null;
  }
}
