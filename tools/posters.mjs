// Renders a poster (still frame of demo mode) for each game into games/posters/<id>.jpg.
// Usage: node tools/posters.mjs [gameId ...]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = path.join(root, 'games');
const outDir = path.join(gamesDir, 'posters');
mkdirSync(outDir, { recursive: true });
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(gamesDir).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));

const browser = await chromium.launch();
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  await page.goto(pathToFileURL(path.join(gamesDir, `${id}.html`)).href + '#demo');
  await page.waitForTimeout(id === 'racer' ? 9000 : 6000);
  const file = path.join(outDir, `${id}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 78 });
  console.log(`poster ${id} -> ${path.relative(root, file)}`);
  await page.close();
}
await browser.close();
