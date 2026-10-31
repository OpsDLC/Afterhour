// Regenerates src/fonts/google-fonts.json, the Google Fonts list the picker searches.
// Source: the google-font-metadata npm package (MIT), downloaded to a temp folder,
// so it never becomes a dependency of the app. Run: npm run fonts:update
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGE = 'google-font-metadata';
const SKIP = /^Material (Icons|Symbols)/;

const dir = mkdtempSync(join(tmpdir(), 'gfm-'));
try {
  execFileSync('npm', ['pack', PACKAGE, '--pack-destination', dir, '--silent'], { stdio: 'pipe' });
  const tarball = readdirSync(dir).find((f) => f.endsWith('.tgz'));
  execFileSync('tar', ['xzf', join(dir, tarball), '-C', dir]);
  const pkg = JSON.parse(readFileSync(join(dir, 'package/package.json'), 'utf8'));
  const data = JSON.parse(readFileSync(join(dir, 'package/data/google-fonts-v2.json'), 'utf8'));

  const fonts = Object.values(data)
    .filter((f) => !SKIP.test(f.family) && f.styles.includes('normal'))
    .map((f) => [f.family, f.category, f.weights])
    .sort((a, b) => a[0].localeCompare(b[0]));

  const out = { source: `${PACKAGE}@${pkg.version}`, fonts };
  writeFileSync(new URL('../src/fonts/google-fonts.json', import.meta.url), JSON.stringify(out));
  console.log(`Wrote ${fonts.length} families from ${out.source}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
