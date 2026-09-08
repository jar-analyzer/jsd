import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8').trim();

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'node',
  outfile: 'dist/jsd.min.js',
  banner: { js: `/*!\n${license}\n*/` },
  legalComments: 'none',
});
