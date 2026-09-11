import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from '../support/paths.mjs';

let work;
try {
  const candidates = process.env.CHROME_BIN
    ? [process.env.CHROME_BIN]
    : ['google-chrome', 'chromium', 'chromium-browser'];
  const browser = candidates.find(
    (command) =>
      spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 10000 }).status === 0,
  );
  assert.ok(browser, 'Chrome or Chromium is required; set CHROME_BIN or add it to PATH');
  work = mkdtempSync(join(tmpdir(), 'jsd-browser-'));
  const page = join(work, 'index.html');
  const script = pathToFileURL(join(root, 'test/browser/code-layout.js')).href;
  const base = pathToFileURL(join(root, 'docs') + '/').href;
  const original = readFileSync(join(root, 'docs/index.html'), 'utf8');
  assert.ok(
    original.includes('<script type="module" src="./app.js"></script>'),
    'demo entry script is missing',
  );
  const html = original
    .replace('<head>', `<head><base href="${base}">`)
    .replace(
      '<script type="module" src="./app.js"></script>',
      `<script type="module" src="${script}"></script>`,
    );
  writeFileSync(page, html);
  const result = spawnSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--window-size=1280,800',
      '--virtual-time-budget=2000',
      `--user-data-dir=${join(work, 'profile')}`,
      '--dump-dom',
      pathToFileURL(page).href,
    ],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, 'headless browser did not finish successfully');
  const output = result.stdout.match(
    /<script id="layout-results" type="application\/json">([^<]+)<\/script>/,
  )?.[1];
  assert.ok(output, 'browser layout checks did not produce results');
  const results = JSON.parse(output);
  assert.equal(results.length, 4, 'all browser layout checks must run');
  for (const test of results)
    console.log(
      `${test.passed ? 'PASS' : 'FAIL'} ${test.name}${test.error ? ': ' + test.error : ''}`,
    );
  assert.ok(
    results.every((test) => test.passed),
    'browser layout regression',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (work) rmSync(work, { recursive: true, force: true });
}
