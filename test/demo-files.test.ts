import test from 'node:test';
import assert from 'node:assert/strict';
import { collectClasses } from '../demo/files.js';

const bytes = new Uint8Array([1]);

test('archive import filters resources and preserves empty class inputs for diagnostics', () => {
  const files = collectClasses([{ name: 'app.jar', bytes }], (_: unknown, options: any) => {
    assert.equal(options.filter({ name: 'icon.png', originalSize: 100 }), false);
    assert.equal(options.filter({ name: 'p/Empty.class', originalSize: 0 }), true);
    return { 'p/Empty.class': new Uint8Array(), 'p/A.CLASS': bytes, 'readme.txt': bytes };
  });
  assert.deepEqual(
    files.map(([name]: [string]) => name),
    ['p/Empty.class', 'p/A.class'],
  );
});

test('duplicate class paths are rejected instead of silently replacing bytecode', () => {
  assert.throws(
    () =>
      collectClasses([
        { name: 'A.class', bytes },
        { name: 'A.class', bytes },
      ]),
    /DUPLICATE/,
  );
});

test('empty or unsupported inputs report that no classes were found', () => {
  assert.throws(() => collectClasses([{ name: 'readme.txt', bytes }]), /NO_CLASSES/);
  assert.throws(() => collectClasses([{ name: 'empty.zip', bytes }], () => ({})), /NO_CLASSES/);
});

test('archive import accepts entries beyond the previous size and class count limits', () => {
  const entries = Object.fromEntries(
    Array.from({ length: 10001 }, (_, index) => [`p/C${index}.class`, bytes]),
  );
  const result = collectClasses([{ name: 'large.zip', bytes }], (_: unknown, options: any) => {
    assert.equal(options.filter({ name: 'Huge.class', originalSize: 65 * 1024 * 1024 }), true);
    return entries;
  });
  assert.equal(result.length, 10001);
});

test('class inputs above the former byte limit are retained', () => {
  const large = new Uint8Array(65 * 1024 * 1024);
  assert.equal(collectClasses([{ name: 'Large.class', bytes: large }])[0][1], large);
});

test('nested archives are listed without recursively opening their contents', () => {
  let calls = 0;
  const result = collectClasses([{ name: 'app.jar', bytes }], (_: unknown, options: any) => {
    calls++;
    assert.equal(options.filter({ name: 'lib/dependency.jar' }), true);
    assert.equal(options.filter({ name: 'lib/dependency.WAR' }), true);
    assert.equal(options.filter({ name: 'lib/dependency.zip' }), true);
    return { 'lib/dependency.jar': bytes };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, [['lib/dependency.jar', bytes]]);
});
