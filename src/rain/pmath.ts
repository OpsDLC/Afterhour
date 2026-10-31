// Portable math for the rain engine.
// Math.exp/pow/cbrt/sin/cos are "implementation-approximated" in JavaScript: browsers and Node
// return different last bits (measured: Chromium 153 vs Node 22 disagree on ~10% of inputs). The
// simulation is chaotic, so one bit grows into a different storm within a second, and a frozen rain
// font must come out the same on every machine for the same seed. These versions use only + − × ÷
// and sqrt, which IEEE 754 rounds exactly, so every engine gets the same bits.
// Accuracy is within a few ulp of Math (checked in tests), far below anything visible.

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const PIO2_HI = 1.5707963267341256;
const PIO2_MID = 6.077100506506192e-11;
const PIO2_LO = 2.0222662487959506e-21;

/** 2^n for integer n, exactly (by doubling). */
function pow2(n: number): number {
  let r = 1;
  if (n > 0) for (let i = 0; i < n; i++) r *= 2;
  else for (let i = 0; i > n; i--) r *= 0.5;
  return r;
}

export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / (LN2_HI + LN2_LO));
  const r = x - k * LN2_HI - k * LN2_LO; // |r| ≤ ln2/2
  // Taylor series to r^13: error < 1e-17 on this range
  let p = 1;
  for (let i = 13; i >= 1; i--) p = 1 + (r * p) / i;
  return k < -1000 ? p * pow2(k + 1000) * pow2(-1000) : p * pow2(k);
}

export function log(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return x;
  // x = m · 2^e with m in [√½, √2)
  let m = x,
    e = 0;
  while (m >= 1.4142135623730951) {
    m *= 0.5;
    e++;
  }
  while (m < 0.7071067811865476) {
    m *= 2;
    e--;
  }
  // log m = 2·atanh(s), s = (m−1)/(m+1), |s| ≤ 0.1716
  const s = (m - 1) / (m + 1),
    s2 = s * s;
  let p = 0;
  for (let i = 25; i >= 3; i -= 2) p = (p + 1 / i) * s2;
  return e * LN2_HI + (2 * s * (1 + p) + e * LN2_LO);
}

/** x^y for x ≥ 0 (all the engine needs). Small integer powers multiply directly. */
export function pow(x: number, y: number): number {
  if (y === 2) return x * x;
  if (y === 3) return x * x * x;
  if (y === 4) {
    const x2 = x * x;
    return x2 * x2;
  }
  if (x === 0) return y > 0 ? 0 : y === 0 ? 1 : Infinity;
  if (x < 0) return NaN;
  return exp(y * log(x));
}

/** Real cube root; Newton-polished so it is exact to the last couple of bits. */
export function cbrt(x: number): number {
  if (x === 0 || x !== x || x === Infinity || x === -Infinity) return x;
  const a = x < 0 ? -x : x;
  let y = exp(log(a) / 3);
  y -= (y * y * y - a) / (3 * y * y);
  y -= (y * y * y - a) / (3 * y * y);
  return x < 0 ? -y : y;
}

export function hypot(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

// sin/cos on |r| ≤ π/4 by Taylor series to r^17 / r^16
function sinK(r: number): number {
  const r2 = r * r;
  let p = 1;
  for (let i = 17; i >= 3; i -= 2) p = 1 - (r2 * p) / (i * (i - 1));
  return r * p;
}
function cosK(r: number): number {
  const r2 = r * r;
  let p = 1;
  for (let i = 16; i >= 2; i -= 2) p = 1 - (r2 * p) / (i * (i - 1));
  return p;
}
function reduce(x: number): [number, number] {
  const k = Math.round(x / (PIO2_HI + PIO2_MID));
  return [x - k * PIO2_HI - k * PIO2_MID - k * PIO2_LO, ((k % 4) + 4) % 4];
}

export function sin(x: number): number {
  const [r, q] = reduce(x);
  return q === 0 ? sinK(r) : q === 1 ? cosK(r) : q === 2 ? -sinK(r) : -cosK(r);
}

export function cos(x: number): number {
  const [r, q] = reduce(x);
  return q === 0 ? cosK(r) : q === 1 ? -sinK(r) : q === 2 ? -cosK(r) : sinK(r);
}
