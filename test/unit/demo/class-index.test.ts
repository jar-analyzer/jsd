import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClass } from '../../../src/classfile/parser.js';
import { classBytes } from '../../support/class-builder.js';
import { describeClasses } from '../../../docs/class-index.js';
import { Workspace } from '../../../docs/workspace.js';

function entry(name: string, outer?: string, prefix = '') {
  return [prefix + name + '.class', classBytes(name, [], outer)];
}

function indexed(entries: any[]) {
  return describeClasses(entries, parseClass);
}

test('explorer hides nested classes while preserving their bytes for decompilation', async () => {
  const state = new Workspace();
  state.replace(
    indexed([
      entry('p/Outer'),
      entry('p/Outer$Member', 'p/Outer'),
      entry('p/Outer$Member$Deep', 'p/Outer$Member'),
      entry('p/Outer$1', 'p/Outer'),
    ]),
  );
  assert.deepEqual([...state.visibleFiles.keys()], ['p/Outer.class']);
  assert.equal(state.files.size, 4);
  let calls = 0;
  const decompile = async (files: any[]) => {
    calls++;
    assert.equal(files.length, 4);
    return {
      sources: [{ name: 'p/Outer', source: 'class Outer { class Member {} }' }],
      status: 'success',
      diagnostics: [],
    };
  };
  const first = await state.select('p/Outer$Member.class', decompile);
  assert.equal(await state.select('p/Outer$Member$Deep.class', decompile), first);
  assert.equal(calls, 1);
  assert.deepEqual(state.tabs, ['p/Outer.class']);
  assert.equal(state.selected, 'p/Outer.class');
});

test('dollar names, missing enclosing classes and malformed files remain visible', async () => {
  const state = new Workspace();
  state.replace(
    indexed([
      entry('Outer'),
      entry('Outer$Dollar'),
      entry('Missing$Inner', 'Missing'),
      ['Outer$Broken.class', new Uint8Array([1])],
    ]),
  );
  assert.equal(state.visibleFiles.size, 4);
  await state.select('Outer$Dollar.class', async (files: any[]) => {
    assert.deepEqual(
      files.map(([path]) => path),
      ['Outer$Dollar.class'],
    );
    return {
      sources: [{ name: 'Outer$Dollar', source: 'class Outer$Dollar {}' }],
      status: 'success',
      diagnostics: [],
    };
  });
  assert.equal(state.current.name, 'Outer$Dollar');
  state.add(indexed([entry('Missing')]));
  assert.equal(state.visibleFiles.has('Missing$Inner.class'), false);
  assert.equal(state.visibleFiles.has('Missing.class'), true);
  state.replace([]);
  assert.equal(state.visibleFiles.size, 0);
  assert.equal(state.classInfo.size, 0);
});

test('expanded archives preserve class metadata without crossing archive boundaries', async () => {
  const state = new Workspace();
  state.replace([
    ['a.jar', new Uint8Array()],
    ['b.jar', new Uint8Array()],
  ]);
  const visible = state.visibleFiles;
  for (const path of ['a.jar', 'b.jar']) {
    await state.expandArchive(path, async () =>
      indexed([entry('p/Outer'), entry('p/Outer$Inner', 'p/Outer')]),
    );
  }
  assert.deepEqual(
    [...state.visibleFiles.keys()],
    ['a.jar', 'b.jar', 'a.jar/p/Outer.class', 'b.jar/p/Outer.class'],
  );
  assert.equal(state.visibleFiles, visible);
  await state.select('b.jar/p/Outer.class', async (files: any[]) => {
    assert.deepEqual(
      files.map(([path]) => path),
      ['b.jar/p/Outer.class', 'b.jar/p/Outer$Inner.class'],
    );
    return {
      sources: [{ name: 'p/Outer', source: 'class Outer {}' }],
      status: 'success',
      diagnostics: [],
    };
  });
});

test('enclosing metadata controls grouping even when filenames do not share a prefix', () => {
  const state = new Workspace();
  state.replace(
    indexed([
      ['root.class', classBytes('Outer', [])],
      ['child.class', classBytes('Outer$Inner', [], 'Outer')],
    ]),
  );
  assert.deepEqual([...state.visibleFiles.keys()], ['root.class']);
});

test('ambiguous or cyclic enclosing metadata never hides every class', () => {
  const state = new Workspace();
  const bytes = new Uint8Array();
  state.replace([
    ['A.class', bytes, { name: 'A', enclosing: 'B' }],
    ['B.class', bytes, { name: 'B', enclosing: 'A' }],
  ]);
  assert.equal(state.visibleFiles.size, 2);
  state.replace([
    ['Outer.class', bytes, { name: 'Outer' }],
    ['Alias.class', bytes, { name: 'Outer' }],
    ['Inner.class', bytes, { name: 'Outer$Inner', enclosing: 'Outer' }],
  ]);
  assert.equal(state.visibleFiles.size, 3);
});
