import test from 'node:test';
import assert from 'node:assert/strict';
import { Workspace, classFamily } from '../../../docs/workspace.js';

const bytes = new Uint8Array([1]);

test('archives expand once, keep separate paths and leave deeper archives unopened', async () => {
  const state = new Workspace();
  state.replace([
    ['lib/a.jar', bytes],
    ['lib/b.jar', bytes],
  ]);
  const files = state.files;
  let calls = 0;
  const extract = async () => {
    calls++;
    return [
      ['p/A.class', bytes],
      ['nested.jar', bytes],
    ];
  };
  assert.equal(await state.expandArchive('lib/a.jar', extract), true);
  assert.equal(await state.expandArchive('lib/a.jar', extract), false);
  assert.equal(await state.expandArchive('lib/b.jar', extract), true);
  assert.equal(calls, 2);
  assert.equal(state.files, files);
  assert.ok(files.has('lib/a.jar/p/A.class'));
  assert.ok(files.has('lib/b.jar/p/A.class'));
  assert.ok(files.has('lib/a.jar/nested.jar'));
  assert.equal(state.archives.has('lib/a.jar/nested.jar'), false);
});

test('cancelled and replaced archive operations cannot add stale contents', async () => {
  for (const replace of [false, true]) {
    const state = new Workspace();
    state.replace([['old.jar', bytes]]);
    let resolve!: (entries: any) => void;
    const pending = state.expandArchive(
      'old.jar',
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    if (replace) state.replace([['new.jar', bytes]]);
    else state.cancel();
    resolve([['A.class', bytes]]);
    assert.equal(await pending, false);
    assert.equal(state.files.has('old.jar/A.class'), false);
    assert.equal(state.archives.size, 0);
  }
});

test('failed extraction can be retried and never replaces existing classes', async () => {
  const state = new Workspace();
  state.replace([
    ['lib.jar', bytes],
    ['lib.jar/A.class', bytes],
  ]);
  await assert.rejects(
    state.expandArchive('lib.jar', async () => {
      throw new Error('corrupt');
    }),
    /corrupt/,
  );
  await assert.rejects(
    state.expandArchive('lib.jar', async () => [
      ['B.class', bytes],
      ['A.class', bytes],
    ]),
    /DUPLICATE/,
  );
  assert.equal(state.files.has('lib.jar/B.class'), false);
  assert.equal(state.archives.size, 0);
  assert.equal(await state.expandArchive('lib.jar', async () => [['B.class', bytes]]), true);
});

test('class families do not include entries from similarly named nested archives', () => {
  const files = new Map([
    ['Outer.class', bytes],
    ['Outer$Inner.class', bytes],
    ['Outer$lib.jar', bytes],
    ['Outer$lib.jar/A.class', bytes],
  ]);
  assert.deepEqual(
    classFamily(files, 'Outer.class').files.map(([path]: [string]) => path),
    ['Outer.class', 'Outer$Inner.class'],
  );
});
