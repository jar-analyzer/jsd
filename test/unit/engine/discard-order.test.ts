import test from 'node:test';
import assert from 'node:assert/strict';
import type { Expr } from '../../../src/ast/ast.js';
import { discardOperands } from '../../../src/decompile/simulate/discard.js';
import { ExprStack } from '../../../src/decompile/simulate/stack.js';

const local: Expr = { kind: 'local', slot: 1, name: 'value' };
const increment: Expr = { kind: 'unary', op: 'x++', operand: local };
const saved: Expr = { kind: 'local', slot: 1002, name: 'saved' };
const call = (args: Expr[]): Expr => ({
  kind: 'invoke',
  mode: 'static',
  owner: 'Calls',
  name: 'effect',
  descriptor: '(I)Ljava/lang/Object;',
  args,
});

function discard(operands: Expr[]) {
  const stack = new ExprStack();
  for (const expr of operands) stack.push(expr);
  const evaluated: { expr: Expr; retain: boolean }[] = [];
  discardOperands(stack, false, (expr, index, retain) => {
    evaluated.push({ expr, retain });
    return retain ? saved : expr;
  });
  return { stack, evaluated };
}

test('a discarded outer-parameter null check does not snapshot the unchanged parameter', () => {
  const outer: Expr = { kind: 'local', slot: 1, name: 'this$0' };
  const check: Expr = {
    kind: 'invoke',
    mode: 'static',
    owner: 'java/util/Objects',
    name: 'requireNonNull',
    descriptor: '(Ljava/lang/Object;)Ljava/lang/Object;',
    args: [outer],
  };
  const { stack, evaluated } = discard([outer, check]);
  assert.deepEqual(evaluated, [{ expr: check, retain: false }]);
  assert.equal(stack.peek().e, outer);
});

test('a local is snapshotted when discarded call arguments mutate its slot', () => {
  const assignment: Expr = {
    kind: 'assign-expr',
    target: local as Extract<Expr, { kind: 'local' }>,
    expr: { kind: 'const', ctype: 'int', value: 7 },
  };
  for (const mutation of [increment, assignment]) {
    const { stack, evaluated } = discard([local, call([mutation])]);
    assert.deepEqual(evaluated[0], { expr: local, retain: true });
    assert.equal(stack.peek().e, saved);
  }
});

test('writes inside discarded array assignment targets also require a snapshot', () => {
  const store: Expr = {
    kind: 'assign-expr',
    target: { kind: 'array', array: { kind: 'local', slot: 2, name: 'array' }, index: increment },
    expr: { kind: 'const', ctype: 'int', value: 9 },
  };
  const { stack, evaluated } = discard([local, store]);
  assert.deepEqual(evaluated[0], { expr: local, retain: true });
  assert.equal(stack.peek().e, saved);
});

test('mutations in older deferred operands preserve the earlier local value', () => {
  const { evaluated } = discard([local, increment, call([])]);
  assert.deepEqual(evaluated.slice(0, 2), [
    { expr: local, retain: true },
    { expr: increment, retain: true },
  ]);
});
