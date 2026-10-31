// Regenerates src/fonts/google-fonts.json, the Google Fonts list the picker searches.
// Source: the google-font-metadata npm package (MIT), downloaded to a temp folder,
// so it never becomes a dependency of the app. Run: npm run fonts:update
// Also writes src/fonts/google-ttf.json: the static TTF of each weight on fonts.gstatic.com,
// loaded lazily when a rain font is built (H4N-28). Pin a version with GFM_VERSION=x.y.z.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGE = 'google-font-metadata';
const SPEC = process.env.GFM_VERSION ? `${PACKAGE}@${process.env.GFM_VERSION}` : PACKAGE;
const GSTATIC = 'https://fonts.gstatic.com/s/';
const SKIP = /^Material (Icons|Symbols)/;

const dir = mkdtempSync(join(tmpdir(), 'gfm-'));
try {
  execFileSync('npm', ['pack', SPEC, '--pack-destination', dir, '--silent'], { stdio: 'pipe' });
  const tarball = readdirSync(dir).find((f) => f.endsWith('.tgz'));
  execFileSync('tar', ['xzf', join(dir, tarball), '-C', dir]);
  const pkg = JSON.parse(readFileSync(join(dir, 'package/package.json'), 'utf8'));
  const data = JSON.parse(readFileSync(join(dir, 'package/data/google-fonts-v2.json'), 'utf8'));

  const families = Object.values(data).filter(
    (f) => !SKIP.test(f.family) && f.styles.includes('normal'),
  );
  const fonts = families
    .map((f) => [f.family, f.category, f.weights])
    .sort((a, b) => a[0].localeCompare(b[0]));

  const out = { source: `${PACKAGE}@${pkg.version}`, fonts };
  writeFileSync(new URL('../src/fonts/google-fonts.json', import.meta.url), JSON.stringify(out));
  console.log(`Wrote ${fonts.length} families from ${out.source}`);

  // weight → path under fonts.gstatic.com/s/ (the TTF is the whole font, not a subset)
  const files = {};
  for (const f of families) {
    const weights = {};
    for (const [weight, styles] of Object.entries(f.variants)) {
      const url = styles.normal && Object.values(styles.normal)[0]?.url?.truetype;
      if (url?.startsWith(GSTATIC)) weights[weight] = url.slice(GSTATIC.length);
    }
    if (Object.keys(weights).length) files[f.family] = weights;
  }
  writeFileSync(
    new URL('../src/fonts/google-ttf.json', import.meta.url),
    JSON.stringify({ source: out.source, files }),
  );
  console.log(`Wrote TTF paths for ${Object.keys(files).length} families`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
