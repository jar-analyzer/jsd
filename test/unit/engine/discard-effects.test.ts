import test from 'node:test';
import assert from 'node:assert/strict';
import type { Expr } from '../../../src/ast/ast.js';
import { decompileClassFile } from '../../../src/index.js';
import { discardOperands } from '../../../src/decompile/simulate/discard.js';
import { ExprStack } from '../../../src/decompile/simulate/stack.js';
import { classBytes } from '../../support/class-builder.js';

const call = (name: string, descriptor = '()I'): Expr => ({
  kind: 'invoke',
  mode: 'static',
  owner: 'Calls',
  name,
  descriptor,
  args: [],
});

test('pop2 retains both category-1 evaluations in their original order', () => {
  const stack = new ExprStack();
  stack.push(call('first'));
  stack.push(call('second'));
  const evaluated: Expr[] = [];
  discardOperands(stack, true, (expr) => {
    evaluated.push(expr);
    return expr;
  });
  assert.deepEqual(evaluated, [call('first'), call('second')]);
  assert.equal(stack.depth, 0);
});

test('discarding an operand snapshots older deferred values before its effects', () => {
  const stack = new ExprStack();
  stack.push(call('first'));
  stack.push(call('second', '()J'), true);
  const evaluated: [Expr, boolean][] = [];
  const saved: Expr = { kind: 'local', name: 'saved', slot: 10 };
  discardOperands(stack, true, (expr, index, retain) => {
    evaluated.push([expr, retain]);
    return retain ? saved : expr;
  });
  assert.deepEqual(evaluated, [
    [call('first'), true],
    [call('second', '()J'), false],
  ]);
  assert.deepEqual(stack.items, [{ e: saved, w: false }]);
});

test('invalid pop widths fail during simulation with explicit diagnostics', () => {
  for (const code of [
    [0x09, 0x57, 0xb1],
    [0x09, 0x03, 0x58, 0xb1],
    [0x03, 0x58, 0xb1],
  ]) {
    const report = decompileClassFile(
      classBytes('InvalidPop', [{ name: 'run', descriptor: '()V', code }]),
    );
    assert.equal(report.status, 'partial');
    assert.equal(report.diagnostics[0].stage, 'simulate');
    assert.match(report.diagnostics[0].message, /pop|underflow/);
  }
});

test('discarded array length and integer division remain evaluated in valid Java statements', () => {
  const report = decompileClassFile(
    classBytes('DiscardedExpressions', [
      { name: 'length', descriptor: '([I)V', code: [0x2a, 0xbe, 0x57, 0xb1] },
      { name: 'divide', descriptor: '(II)V', code: [0x1a, 0x1b, 0x6c, 0x57, 0xb1] },
      { name: 'wide', descriptor: '(JJ)V', code: [0x1e, 0x20, 0x6d, 0x58, 0xb1] },
    ]),
    { banner: false },
  );
  assert.equal(report.status, 'success');
  assert.match(report.source, /int \w+ = \w+\.length;/);
  assert.match(report.source, /int \w+ = \w+ \/ \w+;/);
  assert.match(report.source, /long \w+ = \w+ \/ \w+;/);
});
