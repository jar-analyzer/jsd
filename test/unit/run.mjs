import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, listFiles } from '../support/paths.mjs';

const filters = process.argv.slice(2);
if (filters.some((filter) => filter.startsWith('-')))
  throw new Error('Unit filters must be file or category names');
const cases = listFiles(join(root, 'test/unit'), '.test.ts').filter(
  (path) =>
    !filters.length ||
    filters.some((filter) => relative(join(root, 'test/unit'), path).includes(filter)),
);
if (!cases.length) throw new Error('No unit tests matched the requested filter');
const work = mkdtempSync(join(tmpdir(), 'jsd-unit-'));
try {
  const outfile = join(work, 'unit.test.mjs');
  await build({
    stdin: {
      contents: cases.map((path) => `import ${JSON.stringify(path)};`).join('\n'),
      resolveDir: root,
    },
    outfile,
    bundle: true,
    ignoreAnnotations: true,
    platform: 'node',
    format: 'esm',
  });
  const result = spawnSync(process.execPath, ['--test', outfile], {
    cwd: root,
    stdio: 'inherit',
    timeout: 30000,
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
