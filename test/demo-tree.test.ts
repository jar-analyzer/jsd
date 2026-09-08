import test from 'node:test';
import assert from 'node:assert/strict';
import { TreeState } from '../demo/tree-state.js';

test('adding archive contents refreshes the tree without resetting directory state', () => {
  const state = new TreeState();
  const inputs = new Map([['lib.jar', new Uint8Array()]]);
  state.update(inputs, '');
  state.setOpen('lib.jar', true);
  state.scroll.set('', 250);
  inputs.set('lib.jar/p/A.class', new Uint8Array());
  assert.equal(state.update(inputs, ''), true);
  assert.equal(state.isOpen('lib.jar', 2), true);
  assert.equal(state.scroll.get(''), 250);
  assert.equal(state.update(inputs, ''), false);
});

const files = () =>
  new Map([
    ['root/a/A.class', new Uint8Array()],
    ['root/b/B.class', new Uint8Array()],
  ]);

test('selecting files within the same workspace preserves directory state without rebuilding', () => {
  const state = new TreeState();
  const inputs = files();
  assert.equal(state.update(inputs, ''), true);
  state.setOpen('root/a', true);
  state.setOpen('root', false);
  assert.equal(state.update(inputs, ''), false);
  assert.equal(state.isOpen('root/a', 1), true);
  assert.equal(state.isOpen('root', 0), false);
});

test('search expansion is separate from normal browsing and survives selection refreshes', () => {
  const state = new TreeState();
  const inputs = files();
  state.update(inputs, '');
  state.setOpen('root/a', false);
  state.update(inputs, 'a');
  assert.equal(state.isOpen('root/a', 1), true);
  state.setOpen('root/a', false);
  assert.equal(state.update(inputs, 'a'), false);
  assert.equal(state.isOpen('root/a', 1), false);
  state.update(inputs, 'b');
  assert.equal(state.isOpen('root/b', 1), true);
  state.update(inputs, '');
  assert.equal(state.isOpen('root/a', 1), false);
});

test('normal scroll position survives filtering and a new workspace clears old tree state', () => {
  const state = new TreeState();
  const inputs = files();
  state.update(inputs, '');
  state.scroll.set('', 340);
  state.setOpen('root/a', true);
  state.update(inputs, 'a');
  state.scroll.set('a', 12);
  state.update(inputs, '');
  assert.equal(state.scroll.get(''), 340);
  state.update(files(), '');
  assert.equal(state.scroll.size, 0);
  assert.equal(state.isOpen('root/a', 1), false);
});
