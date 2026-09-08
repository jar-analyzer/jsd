import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { decompileClassFile } from '../dist/jsd.min.js';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}\n${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}
const version = spawnSync('javac', ['-version'], { encoding: 'utf8' });
assert.equal(version.status, 0, 'javac is required for dynamic bytecode round trips');
const major = Number(/javac (\d+)/.exec(version.stdout + version.stderr)?.[1]);
if (major < 11) {
  console.log('SKIP dynamic constants: JDK 11 or later is required');
} else {
  const work = mkdtempSync(join(tmpdir(), 'jsd-dynamic-'));
  try {
    const fixtureModule = join(work, 'fixtures.mjs');
    await build({
      entryPoints: [new URL('./dynamic-fixtures.ts', import.meta.url).pathname],
      outfile: fixtureModule,
      bundle: true,
      platform: 'node',
      format: 'esm',
    });
    const { dynamicFixtures } = await import(pathToFileURL(fixtureModule));
    const original = join(work, 'original'),
      recovered = join(work, 'recovered');
    mkdirSync(original);
    mkdirSync(recovered);
    const harness = join(work, 'RunDynamic.java');
    writeFileSync(
      harness,
      `public class RunDynamic {
        public static void main(String[] args) throws Exception {
          java.lang.reflect.Method method = Class.forName(args[0]).getMethod("value");
          if (args.length > 1 && args[1].equals("error")) {
            String type = null;
            for (int i = 0; i < 2; i++) {
              try { method.invoke(null); throw new AssertionError("Expected resolution failure"); }
              catch (java.lang.reflect.InvocationTargetException error) {
                String actual = error.getCause().getClass().getName();
                if (type != null && !type.equals(actual)) throw new AssertionError("Failure was not retained");
                type = actual;
              }
            }
            System.out.print(type);
            return;
          }
          Object value = method.invoke(null);
          if (args.length > 1 && args[1].equals("identity") && value != method.invoke(null))
            throw new AssertionError("Constant identity changed between resolutions");
          if (value instanceof java.util.function.Supplier)
            value = ((java.util.function.Supplier<?>) value).get();
          ${
            major >= 12
              ? `if (value instanceof java.lang.constant.ClassDesc)
            value = ((java.lang.constant.ClassDesc) value).descriptorString();
          else if (value instanceof Enum.EnumDesc) {
            Enum.EnumDesc<?> desc = (Enum.EnumDesc<?>) value;
            value = desc.constantType().descriptorString() + ":" + desc.constantName();
          }`
              : ''
          }
          System.out.print(String.valueOf(value));
        }
      }`,
    );
    for (const dir of [original, recovered]) run('javac', ['-d', dir, harness]);
    const cases = dynamicFixtures().filter((fixture) => (fixture.minJava ?? 11) <= major);
    for (const { name, bytes, expected, mode } of cases) {
      writeFileSync(join(original, `${name}.class`), bytes);
      const actual = run('java', ['-cp', original, 'RunDynamic', name, mode ?? 'value']);
      assert.equal(actual, expected, `${name}: original JVM behavior`);
      const result = decompileClassFile(bytes, { banner: false });
      assert.equal(result.status, 'success', `${name}: ${JSON.stringify(result.diagnostics)}`);
      const source = join(recovered, `${name}.java`);
      writeFileSync(source, result.source);
      run('javac', ['-d', recovered, source]);
      assert.equal(
        run('java', ['-cp', recovered, 'RunDynamic', name, mode ?? 'value']),
        actual,
        `${name}: recovered behavior`,
      );
      console.log(`PASS ${name}`);
    }
    console.log(`${cases.length} dynamic bytecode round trips passed`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
