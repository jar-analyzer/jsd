import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const work = mkdtempSync(join(tmpdir(), 'jsd-unit-'));
try {
  const outfile = join(work, 'unit.test.mjs');
  await build({
    entryPoints: [new URL('./unit.test.ts', import.meta.url).pathname],
    outfile,

    bundle: true,
    ignoreAnnotations: true,
    platform: 'node',
    format: 'esm',
  });
  const result = spawnSync(process.execPath, ['--test', outfile], {
    stdio: 'inherit',
    timeout: 30000,
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
