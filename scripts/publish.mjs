import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;

if (!npm) throw new Error('Run this script with npm run release');

function run(args, capture = false) {
  const result = spawnSync(process.execPath, [npm, ...args], {
    cwd: root,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
run(['run', 'build']);

const [pack] = JSON.parse(run(['pack', '--dry-run', '--json'], true));
const files = new Map(pack.files.map((file) => [file.path, file.size]));

for (const path of ['dist/jsd.min.js', 'dist/index.d.ts', 'package.json', 'LICENSE']) {
  if (!files.get(path)) throw new Error(`Release package is missing or has an empty ${path}`);
}

run(['publish', '--access', 'public']);
