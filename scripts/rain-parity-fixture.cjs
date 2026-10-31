// Regenerates tests/fixtures/rain-parity.json + rain-page.gray.gz from the approved prototype
// (research/rain/glass-sim.html). Needs Playwright with Chromium (not a project dependency).
// The prototype is run with the engine's portable math (src/rain/pmath.ts) swapped in for Math.*,
// because Math.* differs between engines; with it, prototype and port agree to the bit.
//   node scripts/rain-parity-fixture.cjs
const { chromium } = require('playwright');
const ts = require('typescript');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  zlib = require('node:zlib');
const { stateHash, pixelHash, STEPS, FPS, TOTAL } = require('../tests/rain-hash.cjs');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'research/rain/glass-sim.html'), 'utf8');
for (const [a, b] of [
  ['(RC / d.r) ** 2', 'Math.pow(RC / d.r, 2)'],
  ['(1 - age) ** 0.7', 'Math.pow(1 - age, 0.7)'],
  ['(x / rx) ** 2 + (y / ry) ** 2', 'Math.pow(x / rx, 2) + Math.pow(y / ry, 2)'],
  ['dist ** 4', 'Math.pow(dist, 4)'],
]) {
  if (!html.includes(a)) throw new Error(`prototype changed: ${a}`);
  html = html.replace(a, b);
}
const pm = ts
  .transpileModule(fs.readFileSync(path.join(root, 'src/rain/pmath.ts'), 'utf8'), {
    compilerOptions: { target: 99, module: 99 },
  })
  .outputText.replace(/export /g, '');
const inject = `${pm}\nObject.assign(Math, { exp, pow, cbrt, hypot, sin, cos });`;

const srv = http
  .createServer((_, s) => {
    s.setHeader('content-type', 'text/html');
    s.end(html);
  })
  .listen(0);
(async () => {
  const proxy = process.env.HTTPS_PROXY
    ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
    : undefined;
  const browser = await chromium.launch({ proxy });
  const page = await browser.newPage();
  await page.addInitScript(inject);
  await page.goto(`http://localhost:${srv.address().port}/?view=lens`);
  await page.waitForSelector('body[data-ready]', { timeout: 60000 });
  /* global drops, trails, step, render, renderFusion, ctx, sd, W, H */
  const out = await page.evaluate(
    ({ STEPS, FPS, TOTAL }) => {
      const snaps = {};
      for (let i = 0; i < TOTAL; i++) {
        const t = i / FPS;
        step(1 / FPS, Math.min(1, 0.12 + t / ((TOTAL / FPS) * 0.55)), t);
        if (STEPS.includes(i))
          snaps[i] = {
            drops: drops.map((d) => ({ ...d, trail: null })),
            trails: trails.map((tr) => ({ alive: tr.alive, pts: tr.pts.map((p) => ({ ...p })) })),
          };
      }
      const t = (TOTAL - 1) / FPS;
      render(1, t); // panel 0: lens
      renderFusion(t, { trailHead: 45 }, 1); // panel 1: approved fusion
      const g = (p) => Array.from(ctx.getImageData(p * W, 0, W, H).data);
      return { snaps, sd: Array.from(sd), lens: g(0), fusion: g(1) };
    },
    { STEPS, FPS, TOTAL },
  );
  await browser.close();
  srv.close();
  const fixture = {
    source: 'research/rain/glass-sim.html (v9), seed 11, 960×540',
    steps: {},
    lens: pixelHash(out.lens, 960, 540),
    fusion: pixelHash(out.fusion, 960, 540),
  };
  for (const i of STEPS)
    fixture.steps[i] = {
      drops: out.snaps[i].drops.length,
      trails: out.snaps[i].trails.length,
      hash: stateHash(out.snaps[i]),
    };
  fs.writeFileSync(
    path.join(root, 'tests/fixtures/rain-parity.json'),
    JSON.stringify(fixture, null, 2) + '\n',
  );
  const gray = Buffer.alloc(960 * 540);
  for (let i = 0; i < gray.length; i++) gray[i] = out.sd[i * 4];
  fs.writeFileSync(
    path.join(root, 'tests/fixtures/rain-page.gray.gz'),
    zlib.gzipSync(gray, { level: 9 }),
  );
  console.log(fixture);
})();
