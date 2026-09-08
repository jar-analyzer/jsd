import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'jsd-package-'));
function run(command, args, cwd = work) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0)
    throw new Error(
      `${command} failed: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}
try {
  const packed = JSON.parse(
    run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', work], root),
  );
  writeFileSync(join(work, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    join(work, packed[0].filename),
  ]);
  const installed = join(work, 'node_modules', '@jar-analyzer', 'jsd');
  const license = readFileSync(join(root, 'LICENSE'), 'utf8');
  assert.equal(readFileSync(join(installed, 'LICENSE'), 'utf8'), license);
  const bundle = readFileSync(join(installed, 'dist', 'jsd.min.js'), 'utf8');
  assert.ok(bundle.startsWith(`/*!\n${license.trim()}\n*/\n`));
  await build({
    entryPoints: [join(root, 'test/class-builder.ts')],
    outfile: join(work, 'builder.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  const { classBytes } = await import(pathToFileURL(join(work, 'builder.mjs')));
  const bytes = classBytes('PackageSmoke', [{ name: 'answer', code: [0x10, 42, 0xac] }]);
  writeFileSync(
    join(work, 'fixture.ts'),
    `export const bytes = new Uint8Array(${JSON.stringify([...bytes])});\n`,
  );
  writeFileSync(join(work, 'consumer.ts'), readFileSync(join(root, 'test/package-consumer.ts')));
  writeFileSync(
    join(work, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        types: [],
        skipLibCheck: false,
        outDir: './out',
      },
      include: ['consumer.ts', 'fixture.ts'],
    }),
  );
  run(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'),
    '-p',
    join(work, 'tsconfig.json'),
  ]);
  console.log(run(process.execPath, [join(work, 'out/consumer.js')]).trim());
  rmSync(work, { recursive: true, force: true });
} catch (error) {
  console.error(error);
  console.error(`Artifacts: ${work}`);
  process.exitCode = 1;
}
