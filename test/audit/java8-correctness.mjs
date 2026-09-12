import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decompileClassSet } from '../../dist/jsd.min.js';
import { assertGeneratedSources } from '../support/roundtrip-checks.mjs';

const fixtures = fileURLToPath(new URL('../roundtrip/fixtures/core/correctness/', import.meta.url));
const cases = new Set([
  'AnonymousNative',
  'AnonymousProtectedOverride',
  'AnonymousStrict',
  'AnonymousVisibility',
  'GenericInnerEmpty',
  'GenericInnerSimple',
  'InnerConstructionSemantics',
  'InterfaceStrict',
  'NestedInnerLocal',
]);
const options = process.argv.slice(2);
if (options.some((arg) => arg.startsWith('--source=') && !/^--source=[678]$/.test(arg)))
  throw new Error('Audit source version must be 6, 7, or 8');
const release = options.find((arg) => /^--source=[678]$/.test(arg))?.split('=')[1];
const filters = options.filter((arg) => !arg.startsWith('--source='));
if (filters.some((arg) => arg.startsWith('-'))) throw new Error('Unknown audit option');
const files = readdirSync(fixtures).filter(
  (file) =>
    file.endsWith('.java') &&
    cases.has(basename(file, '.java')) &&
    (!filters.length || filters.some((f) => file.includes(f))),
);
if (!files.length) throw new Error('No audit fixtures matched');
const work = mkdtempSync(join(tmpdir(), 'jsd-java8-audit-'));
const compileOptions = release ? ['-source', release, '-target', release] : [];
const results = [];
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated: ${result.signal}`);
  return { code: result.status, out: result.stdout, err: result.stderr };
}
for (const file of files) {
  const name = basename(file, '.java');
  for (const mode of ['debug', 'no-debug']) {
    const dir = join(work, name, mode);
    const original = join(dir, 'original');
    const recovered = join(dir, 'recovered');
    mkdirSync(original, { recursive: true });
    mkdirSync(recovered, { recursive: true });
    writeFileSync(join(original, file), readFileSync(join(fixtures, file)));
    const flags = [mode === 'debug' ? '-g' : '-g:none', ...compileOptions];
    const firstCompile = run('javac', [...flags, file], original);
    if (firstCompile.code !== 0)
      throw new Error(`Original compilation failed: ${name}\n${firstCompile.err}`);
    const before = run('java', ['-Xverify:all', name], original);
    if (before.code !== 0) throw new Error(`Original execution failed: ${name}\n${before.err}`);
    const inputs = new Map(
      readdirSync(original)
        .filter((entry) => entry.endsWith('.class'))
        .map((entry) => [entry, new Uint8Array(readFileSync(join(original, entry)))]),
    );
    const sources = decompileClassSet(inputs);
    assertGeneratedSources(sources);
    const javaFiles = sources.filter((source) => source.path.endsWith('.java'));
    for (const source of javaFiles) {
      mkdirSync(join(recovered, source.path, '..'), { recursive: true });
      writeFileSync(join(recovered, source.path), source.source);
    }
    const compiled = run('javac', [...flags, ...javaFiles.map((source) => source.path)], recovered);
    const after = compiled.code === 0 ? run('java', ['-Xverify:all', name], recovered) : compiled;
    const passed =
      compiled.code === 0 &&
      before.code === after.code &&
      before.out === after.out &&
      before.err === after.err;
    const result = {
      name,
      mode,
      passed,
      stage: compiled.code === 0 ? 'execution' : 'compilation',
      status: sources.map((source) => source.status),
      before,
      after,
    };
    results.push(result);
    console.log(
      `${passed ? 'PASS' : 'FAIL'} ${name} / ${mode} / ${result.stage} / ${result.status.join(',')}`,
    );
  }
}
writeFileSync(join(work, 'results.json'), JSON.stringify(results, null, 2) + '\n');
const failures = results.filter((result) => !result.passed).length;
console.log(`${results.length - failures} passed, ${failures} failed / ${results.length} total`);
if (failures) {
  console.log(`Artifacts: ${work}`);
  process.exitCode = 1;
} else {
  rmSync(work, { recursive: true, force: true });
}
