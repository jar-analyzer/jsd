import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpoint } from '../src/decompile/structure/checkpoint.js';
import { attemptRecognition } from '../src/decompile/structure/recognition.js';
import { StructFail } from '../src/decompile/structure/types.js';
import { recognitionFixture } from './recognition-fixture.js';

test('failed recognition restores values and shared object identities', () => {
  const f = recognitionFixture();
  const before = f.snapshot();
  const simStatements = f.state.sim.stmts;
  const body = f.statement.body;
  const result = attemptRecognition(f.state, f.inputs, () => {
    f.mutate();
    return null;
  });
  assert.equal(result, null);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.state.sim.stmts, simStatements);
  assert.equal(f.outer[0], f.statement);
  assert.equal(f.statement.body, body);
  assert.equal(f.state.rangeByStart.get(0)![0], f.group);
  assert.equal(f.state.pendingMonitors[0].arr, f.outer);
  assert.equal(f.wctx.breakables[0].stmt, f.statement);
});

test('expected structure failure rolls back before the next candidate', () => {
  const f = recognitionFixture();
  const before = f.snapshot();
  assert.equal(
    attemptRecognition(f.state, f.inputs, () => {
      f.mutate();
      throw new StructFail('candidate does not match');
    }),
    null,
  );
  assert.deepEqual(f.snapshot(), before);
  const result = attemptRecognition(f.state, f.inputs, () => {
    assert.deepEqual(f.snapshot(), before);
    f.group.done = true;
    return { stmt: f.statement, next: 3 };
  });
  assert.equal(result?.next, 3);
  assert.equal(f.group.done, true);
});

test('unexpected recognition errors are restored and rethrown', () => {
  const f = recognitionFixture();
  const before = f.snapshot();
  const failure = new Error('programming error');
  assert.throws(
    () =>
      attemptRecognition(f.state, f.inputs, () => {
        f.mutate();
        throw failure;
      }),
    (error) => error === failure,
  );
  assert.deepEqual(f.snapshot(), before);
});

test('an outer rollback also restores successful nested recognition', () => {
  const f = recognitionFixture();
  const before = f.snapshot();
  attemptRecognition(f.state, f.inputs, () => {
    attemptRecognition(f.state, f.inputs, () => {
      f.mutate();
      return true;
    });
    assert.equal(f.group.done, true);
    return null;
  });
  assert.deepEqual(f.snapshot(), before);
});

test('an inner rollback preserves changes already made by its outer recognition', () => {
  const f = recognitionFixture();
  attemptRecognition(f.state, f.inputs, () => {
    f.state.usedLabels = 7;
    const before = f.snapshot();
    attemptRecognition(f.state, f.inputs, () => {
      f.mutate();
      return null;
    });
    assert.deepEqual(f.snapshot(), before);
    return true;
  });
  assert.equal(f.state.usedLabels, 7);
});

test('checkpoints restore sparse arrays, cycles, maps and newly added properties', () => {
  const array = new Array<number>(4);
  array[2] = 9;
  const object: { value: number; extra?: boolean; self?: object } = { value: 1 };
  object.self = object;
  const map = new Map([[object, array]]);
  const restore = checkpoint([map]);
  array.length = 0;
  array.push(1);
  object.extra = true;
  object.value = 8;
  delete object.self;
  map.clear();
  restore();
  assert.equal(map.get(object), array);
  assert.equal(array.length, 4);
  assert.equal(0 in array, false);
  assert.equal(array[2], 9);
  assert.equal(object.self, object);
  assert.equal(object.value, 1);
  assert.equal('extra' in object, false);
});
