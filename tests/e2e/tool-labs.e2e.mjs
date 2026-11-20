// Browser smoke test for isolated tool labs. Requires playwright and installed Chromium.
// Run from repo root: node tests/e2e/tool-labs.e2e.mjs
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    const file = resolve(root, '.' + relative);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const [name, viewport] of [
    ['mobile', { width: 390, height: 844 }],
    ['desktop', { width: 1280, height: 800 }],
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    for (const lab of ['tools-vfx', 'tools-sfx']) {
      const response = await page.goto(base + '/' + lab + '/', { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, lab + ' HTTP status');
      assert.equal(await page.locator('button').count() > 0, true, lab + ' buttons');
      assert.equal(await page.locator('#status').count(), 1, lab + ' status');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, lab + ' horizontal overflow');
      if (lab === 'tools-vfx') {
        assert.equal(await page.locator('canvas').count(), 1);
        assert.equal(await page.locator('#pause').getAttribute('aria-pressed'), 'true');
      }
    }
    assert.deepEqual(errors, [], name + ' page errors');
    console.log('PASS', name, 'layout and reduced-motion smoke');
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
