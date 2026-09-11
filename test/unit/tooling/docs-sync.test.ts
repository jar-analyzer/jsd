import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { syncDocs } from '../../../scripts/doc-artifacts.mjs';

function fixture(run: (root: string, bundle: Buffer) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'jsd-docs-test-'));
  try {
    mkdirSync(join(root, 'dist'));
    mkdirSync(join(root, 'docs'));
    for (const path of ['README.md', 'README.zh-CN.md', 'docs/index.html'])
      writeFileSync(join(root, path), readFileSync(path));
    const bundle = Buffer.from('export const sample = "' + 'a'.repeat(123456) + '";\n');
    writeFileSync(join(root, 'dist/jsd.min.js'), bundle);
    writeFileSync(join(root, 'docs/jsd.browser.js'), 'stale');
    run(root, bundle);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('documentation sync measures the bundle and updates every bilingual and demo display', () => {
  fixture((root, bundle) => {
    const sizes = syncDocs(root);
    const compressed = gzipSync(bundle, { level: 9 }).length;
    assert.equal(sizes.bytes, bundle.length);
    assert.equal(sizes.gzipBytes, compressed);
    assert.deepEqual(readFileSync(join(root, 'docs/jsd.browser.js')), bundle);
    const kb = Math.round(bundle.length / 1000);
    const gzipKb = Math.round(compressed / 1000);
    assert.ok(
      readFileSync(join(root, 'README.md'), 'utf8').includes(
        `approximately ${kb} KB, or ${gzipKb} KB`,
      ),
    );
    assert.ok(
      readFileSync(join(root, 'README.zh-CN.md'), 'utf8').includes(
        `约 ${kb} KB，gzip 后约 ${gzipKb} KB`,
      ),
    );
    const html = readFileSync(join(root, 'docs/index.html'), 'utf8');
    for (const size of [kb, gzipKb]) {
      assert.ok(html.includes(`~${size} <small>KB</small>`));
      assert.ok(html.includes(`${(size / 1000).toFixed(3)} MB`));
    }
    assert.ok(html.includes(`JS ~${kb} KB · gzip ~${gzipKb} KB`));
    assert.deepEqual(syncDocs(root, true), sizes);
  });
});

test('documentation CI check rejects stale files without rewriting them', () => {
  fixture((root) => {
    syncDocs(root);
    for (const path of ['README.md', 'README.zh-CN.md', 'docs/index.html', 'docs/jsd.browser.js']) {
      const file = join(root, path);
      const original = readFileSync(file);
      const stale = path.endsWith('.js')
        ? 'outdated bundle'
        : original
            .toString()
            .replace(/\d+ KB|~\d+ <small>/, (value) => value.replace(/\d+/, '999'));
      writeFileSync(file, stale);
      assert.throws(() => syncDocs(root, true), {
        message: new RegExp(path.replaceAll('.', '\\.')),
      });
      assert.equal(readFileSync(file, 'utf8'), stale);
      writeFileSync(file, original);
    }
  });
});

test('documentation sync refuses to partially update missing or duplicated size displays', () => {
  fixture((root) => {
    const file = join(root, 'README.md');
    const source = readFileSync(file, 'utf8');
    for (const invalid of ['', source + '\n' + source]) {
      writeFileSync(file, invalid);
      assert.throws(() => syncDocs(root), /Missing or ambiguous size display in README\.md/);
      assert.equal(readFileSync(join(root, 'docs/jsd.browser.js'), 'utf8'), 'stale');
    }
  });
});
