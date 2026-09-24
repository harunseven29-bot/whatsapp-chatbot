// Headless smoke test for Neon Arcade games.
// Usage: node tools/smoke.mjs [gameId ...]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = require(path.join(globalRoot, 'playwright')));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = path.join(root, 'games');
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(gamesDir).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));

const browser = await chromium.launch();
let failed = 0;

async function check(url, label, viewport, fn) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (m) => {
    // Remote resources (web fonts) may be unreachable offline; only local failures count.
    if (m.type() !== 'error' || /^https?:/.test(m.location().url || '')) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  try {
    await page.goto(url);
    await page.waitForTimeout(300);
    await fn(page, errors);
  } catch (e) {
    errors.push(`exception: ${e.message}`);
  }
  await page.close();
  if (errors.length) {
    failed++;
    console.log(`✗ ${label}\n  ${errors.join('\n  ')}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

for (const id of ids) {
  const file = path.join(gamesDir, `${id}.html`);
  if (!existsSync(file)) { failed++; console.log(`✗ ${id}: missing ${file}`); continue; }
  for (const viewport of [{ width: 1280, height: 800 }, { width: 360, height: 700 }]) {
    await check(pathToFileURL(file).href, `${id} @ ${viewport.width}px`, viewport, async (page, errors) => {
      const hook = await page.evaluate(() => window.__arcade && { id: window.__arcade.id, s: window.__arcade.state() });
      if (!hook) { errors.push('window.__arcade missing'); return; }
      if (hook.id !== id) errors.push(`__arcade.id is "${hook.id}", expected "${id}"`);
      if (hook.s.status !== 'ready') errors.push(`initial status "${hook.s.status}", expected "ready"`);
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Space']) {
        await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k);
      }
      const s = await page.evaluate(() => window.__arcade.state());
      if (!['playing', 'over'].includes(s.status)) errors.push(`after input status "${s.status}", expected playing/over`);
      const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      if (scroll[0] > scroll[1] + 1) errors.push(`horizontal overflow: ${scroll[0]} > ${scroll[1]}`);
      await page.keyboard.press('p');
      await page.waitForTimeout(100);
      const p = await page.evaluate(() => window.__arcade.state());
      if (s.status === 'playing' && p.status !== 'paused' && p.status !== 'over') errors.push(`P did not pause (status "${p.status}")`);
      if (p.status === 'paused') await page.keyboard.press('p');
      // Soak: 5 s of random gameplay input.
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
      const end = Date.now() + 5000;
      while (Date.now() < end) {
        const k = keys[Math.floor(Math.random() * keys.length)];
        await page.keyboard.down(k); await page.waitForTimeout(40 + Math.random() * 160); await page.keyboard.up(k);
      }
      const after = await page.evaluate(() => window.__arcade.state());
      if (typeof after.score !== 'number' || Number.isNaN(after.score)) errors.push(`score is not a number: ${after.score}`);
    });
    await check(pathToFileURL(file).href + '#demo', `${id} demo @ ${viewport.width}px`, viewport, async (page, errors) => {
      await page.waitForTimeout(1200);
      const s = await page.evaluate(() => window.__arcade && window.__arcade.state());
      if (!s || s.status !== 'demo') errors.push(`demo status "${s && s.status}", expected "demo"`);
      const a = await page.screenshot();
      await page.waitForTimeout(700);
      const b = await page.screenshot();
      if (a.equals(b)) errors.push('demo canvas is not animating');
      await page.waitForTimeout(2500);
    });
  }
}

const launcher = path.join(root, 'index.html');
if (!process.argv.slice(2).length && existsSync(launcher)) {
  await check(pathToFileURL(launcher).href, 'launcher', { width: 390, height: 800 }, async (page, errors) => {
    const n = await page.locator('[data-game]').count();
    if (n !== ids.length) errors.push(`launcher lists ${n} games, found ${ids.length} files`);
  });
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
