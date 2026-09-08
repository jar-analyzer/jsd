import test from 'node:test';
import assert from 'node:assert/strict';
import { Workspace, classFamily } from '../demo/workspace.js';

const bytes = new Uint8Array([1]);
const report = (name: string, status = 'success') => ({
  sources: [{ name, source: `class ${name} {}` }],
  status,
  diagnostics: status === 'partial' ? [{ message: 'warning' }] : [],
});
const deferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('inner class selection includes its outer family under archive prefixes', () => {
  const files = new Map(
    [
      'BOOT-INF/classes/p/Outer.class',
      'BOOT-INF/classes/p/Outer$Inner.class',
      'BOOT-INF/classes/p/Other.class',
    ].map((path) => [path, bytes]),
  );
  const family = classFamily(files, 'BOOT-INF/classes/p/Outer$Inner.class');
  assert.equal(family.root, 'BOOT-INF/classes/p/Outer.class');
  assert.equal(family.files.length, 2);
});

test('cached inner and outer selections share source and retain partial diagnostics', async () => {
  const state = new Workspace();
  state.replace([
    ['Outer.class', bytes],
    ['Outer$Inner.class', bytes],
  ]);
  const first = await state.select('Outer$Inner.class', async () => report('p/Outer', 'partial'));
  const second = await state.select('Outer.class', async () => {
    throw new Error('cache miss');
  });
  assert.equal(second, first);
  assert.equal(second.status, 'partial');
  assert.equal(second.diagnostics[0].message, 'warning');
  assert.equal(state.cache.size, 1);
});

test('a slower selection cannot replace the most recently selected source', async () => {
  const state = new Workspace();
  state.replace([
    ['A.class', bytes],
    ['B.class', bytes],
  ]);
  const pending = deferred();
  const old = state.select('A.class', () => pending.promise);
  await state.select('B.class', async () => report('B'));
  pending.resolve(report('A'));
  assert.equal(await old, null);
  assert.equal(state.current.name, 'B');
});

test('replacing files prevents old jobs from repopulating the cache', async () => {
  const state = new Workspace();
  state.replace([['A.class', bytes]]);
  const pending = deferred();
  const old = state.select('A.class', () => pending.promise);
  state.replace([['B.class', bytes]]);
  pending.resolve(report('A'));
  assert.equal(await old, null);
  assert.equal(state.current, null);
  assert.equal(state.cache.size, 0);
});

test('cancelled selection preserves the displayed class and selection', async () => {
  const state = new Workspace();
  state.replace([
    ['A.class', bytes],
    ['B.class', bytes],
  ]);
  await state.select('A.class', async () => report('A'));
  const pending = deferred();
  const next = state.select('B.class', () => pending.promise);
  state.cancel();
  pending.resolve(report('B'));
  assert.equal(await next, null);
  assert.equal(state.current.name, 'A');
  assert.equal(state.selected, 'A.class');
});

test('a failed report without sources keeps its diagnostic status', async () => {
  const state = new Workspace();
  state.replace([['Bad.class', bytes]]);
  const result = await state.select('Bad.class', async () => ({
    sources: [],
    status: 'failed',
    diagnostics: [{ message: 'parse failed' }],
  }));
  assert.equal(result.source, '');
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics[0].message, 'parse failed');
});
