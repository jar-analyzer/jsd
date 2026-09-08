import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const work = mkdtempSync(join(tmpdir(), 'jsd-validation-'));
try {
  const modulePath = join(work, 'fixtures.mjs');
  await build({
    entryPoints: ['test/validation-fixtures.ts'],
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { validationFixtures } = await import(pathToFileURL(modulePath).href);
  writeFileSync(
    join(work, 'Validate.java'),
    'public class Validate { public static void main(String[] args) throws Exception { Class.forName(args[0]).getDeclaredMethods(); } }',
  );
  const compiled = spawnSync('javac', [join(work, 'Validate.java')], {
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(compiled.status, 0, compiled.stderr);
  for (const fixture of validationFixtures()) {
    writeFileSync(join(work, fixture.name + '.class'), fixture.bytes);
    const result = spawnSync('java', ['-Xverify:all', '-cp', work, 'Validate', fixture.name], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.notEqual(result.status, 0, fixture.name);
    assert.match(
      result.stderr,
      /VerifyError|ClassFormatError/,
      fixture.name + ': ' + result.stderr,
    );
    console.log(`PASS ${fixture.name}: rejected by JVM`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
