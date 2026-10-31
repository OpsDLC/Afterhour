// Shared by the parity test and the fixture script, so both hash state the same way.
const { createHash } = require('node:crypto');
const STEPS = [29, 149, 299, 449],
  FPS = 30,
  TOTAL = 450;
const FIELDS = [
  'id',
  'x',
  'y',
  'r',
  'vx',
  'vy',
  'stop',
  'moving',
  'travel',
  'nextBead',
  'ax',
  'rot',
  'shake',
  'ph',
  'parkedAt',
  'feed',
];

/** Every number in the state, as float64 bits, in order. */
function stateHash({ drops, trails }) {
  const nums = [];
  for (const d of drops) for (const f of FIELDS) nums.push(d[f] === undefined ? -1 : Number(d[f]));
  for (const tr of trails) {
    nums.push(tr.alive ? 1 : 0, tr.pts.length);
    for (const p of tr.pts) nums.push(p.x, p.y, p.w, p.t);
  }
  return createHash('sha256')
    .update(Buffer.from(new Float64Array(nums).buffer))
    .digest('hex');
}

/** Hash of an RGBA image, leaving out the prototype's caption strip (bottom 32 rows) and the left column (panel divider). */
function pixelHash(rgba, W, H) {
  const h = createHash('sha256');
  for (let y = 0; y < H - 32; y++)
    h.update(Uint8Array.from(Array.prototype.slice.call(rgba, (y * W + 1) * 4, (y + 1) * W * 4)));
  return h.digest('hex');
}

module.exports = { stateHash, pixelHash, STEPS, FPS, TOTAL };
