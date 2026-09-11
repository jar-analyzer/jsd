import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { decompileClassFile } from '../../dist/jsd.min.js';

const work = mkdtempSync(join(tmpdir(), 'jsd-correctness-'));
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: work, encoding: 'utf8', timeout: 30000 });
  assert.equal(
    result.status,
    0,
    `${command}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
};
try {
  const modulePath = join(work, 'builder.mjs');
  await build({
    entryPoints: [new URL('../support/dynamic-class-builder.ts', import.meta.url).pathname],
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { DynamicClassBuilder } = await import(pathToFileURL(modulePath));
  const original = join(work, 'original'),
    recovered = join(work, 'recovered');
  mkdirSync(original);
  mkdirSync(recovered);
  const cases = [];
  for (const value of [0, 1, 2, 3, -1]) {
    const name = `BooleanValue${value < 0 ? 'Minus1' : value}`;
    const builder = new DynamicClassBuilder(name);
    cases.push({
      name,
      bytes: builder.build([value + 3, 0xac], '()Z'),
      expected: String((value & 1) !== 0),
    });
  }
  for (const bits of [0x7fc00001, 0x7fc01234, 0xffc00001, 0x7fc00000]) {
    const name = 'FloatPayload' + bits.toString(16);
    const builder = new DynamicClassBuilder(name);
    const index = builder.entry(
      4,
      bits >>> 24,
      (bits >>> 16) & 255,
      (bits >>> 8) & 255,
      bits & 255,
    );
    cases.push({
      name,
      bytes: builder.build([0x12, index, 0xae], '()F'),
      expected: String(bits | 0),
    });
  }
  const harness = join(work, 'Probe.java');
  writeFileSync(
    harness,
    `public class Probe {
    public static void main(String[] args) throws Exception {
      Object value = Class.forName(args[0]).getMethod("value").invoke(null);
      System.out.print(value instanceof Float ? Float.floatToRawIntBits((Float)value) : value);
    }
  }`,
  );
  run('javac', ['-d', '.', relative(work, harness)]);
  for (const fixture of cases) {
    writeFileSync(join(original, fixture.name + '.class'), fixture.bytes);
    const result = decompileClassFile(fixture.bytes);
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    const source = join(recovered, fixture.name + '.java');
    writeFileSync(source, result.source);
    run('javac', ['-d', relative(work, recovered), relative(work, source)]);
    const before = run('java', [
      '-Xverify:all',
      '-cp',
      [relative(work, original), '.'].join(delimiter),
      'Probe',
      fixture.name,
    ]);
    const after = run('java', [
      '-Xverify:all',
      '-cp',
      [relative(work, recovered), '.'].join(delimiter),
      'Probe',
      fixture.name,
    ]);
    assert.equal(before, fixture.expected, fixture.name + ' baseline');
    assert.equal(after, before, fixture.name + ' round trip');
    console.log('PASS ' + fixture.name);
  }
  rmSync(work, { recursive: true, force: true });
} catch (error) {
  console.error(String(error).replaceAll(work, '<temporary>').replaceAll(process.cwd(), '.'));
  console.error(`Artifacts: ${basename(work)} (temporary directory)`);
  process.exitCode = 1;
}
