import test from 'node:test';
import assert from 'node:assert/strict';
import { Workspace, classFamily } from '../../../docs/workspace.js';

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

test('tabs keep insertion order, deduplicate selections and switch using cached source', async () => {
  const state = new Workspace();
  state.replace(['A', 'B', 'C'].map((name) => [`${name}.class`, bytes]));
  for (const name of ['A', 'B', 'C', 'A']) {
    await state.select(`${name}.class`, async () => report(name));
  }
  assert.deepEqual(state.tabs, ['A.class', 'B.class', 'C.class']);
  state.closeTabs('B.class');
  assert.equal(state.currentPath, 'A.class');
  state.closeTabs('A.class');
  assert.equal(state.currentPath, 'C.class');
  assert.equal(state.current.source, 'class C {}');
  assert.equal(state.selected, 'C.class');
});

test('batch tab closes use the clicked tab and preserve or replace the active tab correctly', async () => {
  for (const [mode, expected, active] of [
    ['left', ['C.class', 'D.class'], 'C.class'],
    ['right', ['A.class', 'B.class', 'C.class'], 'A.class'],
    ['others', ['C.class'], 'C.class'],
    ['all', [], null],
  ] as const) {
    const state = new Workspace();
    state.replace(['A', 'B', 'C', 'D'].map((name) => [`${name}.class`, bytes]));
    for (const name of ['A', 'B', 'C', 'D', 'A'])
      await state.select(`${name}.class`, async () => report(name));
    state.closeTabs('C.class', mode);
    assert.deepEqual(state.tabs, expected);
    assert.equal(state.currentPath, active);
    assert.equal(state.selected, active);
    if (!active) assert.equal(state.current, null);
  }
});

test('closing all tabs prevents a pending decompilation from reopening an editor', async () => {
  const state = new Workspace();
  state.replace([
    ['A.class', bytes],
    ['B.class', bytes],
  ]);
  await state.select('A.class', async () => report('A'));
  const pending = deferred();
  const selection = state.select('B.class', () => pending.promise);
  state.closeTabs('A.class', 'all');
  pending.resolve(report('B'));
  assert.equal(await selection, null);
  assert.deepEqual(state.tabs, []);
  assert.equal(state.current, null);
  assert.equal(state.selected, null);
  assert.equal(state.files.size, 2);
  await state.select('B.class', async () => {
    throw new Error('cache miss');
  });
  assert.deepEqual(state.tabs, ['B.class']);
});

test('adding files preserves open tabs and rejects duplicates atomically', async () => {
  const state = new Workspace();
  state.replace([['A.class', bytes]]);
  await state.select('A.class', async () => report('A'));
  state.add([['B.class', bytes]]);
  assert.deepEqual(state.tabs, ['A.class']);
  assert.equal(state.current.name, 'A');
  assert.throws(
    () =>
      state.add([
        ['C.class', bytes],
        ['A.class', bytes],
      ]),
    /DUPLICATE/,
  );
  assert.equal(state.files.has('C.class'), false);
  state.replace([]);
  assert.deepEqual(state.tabs, []);
});

test('adding family members refreshes cached decompilation without losing open editors', async () => {
  const state = new Workspace();
  state.replace([
    ['Outer$Inner.class', bytes],
    ['B.class', bytes],
  ]);
  await state.select('Outer$Inner.class', async () => report('Inner'));
  await state.select('B.class', async () => report('B'));
  state.add([['Outer.class', bytes]]);
  state.closeTabs('B.class');
  assert.equal(state.current.name, 'Inner');
  await state.select('Outer$Inner.class', async (files) => {
    assert.equal(files.length, 2);
    return report('Outer');
  });
  state.add([['Outer$Other.class', bytes]]);
  await state.select('Outer.class', async (files) => {
    assert.equal(files.length, 3);
    return report('OuterWithOther');
  });
  assert.equal(state.current.name, 'OuterWithOther');
});
