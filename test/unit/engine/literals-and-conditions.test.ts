import { opsPart } from '../../../src/decompile/simulate/ops.js';
import { ExprStack } from '../../../src/decompile/simulate/stack.js';
import { exprStr } from '../../../src/decompile/printer/expr.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ByteReader } from '../../../src/util/bytes.js';
import { exprEq } from '../../../src/ast/ast.js';
import { negate } from '../../../src/ast/conditions.js';
import { canon } from '../../../src/decompile/structure/conditions.js';
import { javaLiteral, charLiteral } from '../../../src/decompile/printer/literals.js';
import { assertGeneratedSources } from '../../support/roundtrip-checks.mjs';

const decoder = new ByteReader(new Uint8Array());

test('Modified UTF-8 preserves every UTF-16 code unit, including null, BOM and lone surrogates', () => {
  const bytes: number[] = [];
  let expected = '';
  for (let c = 0; c <= 0xffff; c++) {
    expected += String.fromCharCode(c);
    if (c > 0 && c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  assert.equal(decoder.modifiedUtf8(Uint8Array.from(bytes)), expected);
});

test('Modified UTF-8 rejects malformed, truncated, overlong and ordinary four-byte UTF-8', () => {
  for (const bytes of [
    [0],
    [0x80],
    [0xc0],
    [0xc1, 0x81],
    [0xe0, 0x80, 0x80],
    [0xed, 0xa0],
    [0xf0, 0x9f, 0x98, 0x80],
  ]) {
    assert.throws(() => decoder.modifiedUtf8(Uint8Array.from(bytes)), /UTF-8/);
  }
});

test('Java literals preserve signs, precision suffixes and safe escaping', () => {
  assert.equal(javaLiteral('double', -0), '-0.0');
  assert.equal(javaLiteral('float', -0), '-0.0f');
  assert.equal(javaLiteral('float', 1.5), '1.5f');
  assert.equal(charLiteral(39), "'\\''");
  assert.equal(charLiteral(92), "'\\\\'");
  assert.equal(charLiteral(10), "'\\n'");
  assert.equal(javaLiteral('string', '\0\r\n\t\ud800'), '"\\000\\r\\n\\t\\ud800"');
  assert.equal(javaLiteral('long', 9223372036854775807n), '9223372036854775807L');
});

test('AST equality distinguishes signed zero and unordered comparison semantics', () => {
  const zero = { kind: 'const', ctype: 'double', value: 0 } as const;
  assert.equal(exprEq(zero, { ...zero, value: -0 }), false);
  const cmp = { kind: 'binary', op: 'cmp', left: zero, right: zero, nanResult: -1 } as const;
  assert.equal(exprEq(cmp, { ...cmp, nanResult: 1 }), false);
});

test('condition normalization preserves negation and unordered floating comparisons', () => {
  const x = { kind: 'local', slot: 1, name: 'x' } as const;
  const cond = { kind: 'binary', op: '<', left: x, right: x, floatingComparison: true } as const;
  const negated = { kind: 'unary', op: '!', operand: cond } as const;
  assert.deepEqual(negate(cond), negated);
  assert.deepEqual(canon(negated), negated);
  assert.deepEqual(negate(negated), cond);
  assert.deepEqual(canon({ kind: 'unary', op: '!', operand: x }), {
    kind: 'unary',
    op: '!',
    operand: x,
  });
});

test('round-trip tests reject empty output and failure placeholders in unexecuted methods', () => {
  assert.throws(() => assertGeneratedSources([]));
  for (const marker of [
    'DECOMPILATION FAILED',
    'lambda decompilation failed',
    '/* invokedynamic: unknown */',
  ]) {
    assert.throws(() => assertGeneratedSources([{ path: 'X.java', source: marker }]));
  }
  assert.doesNotThrow(() => assertGeneratedSources([{ path: 'X.java', source: 'class X {}' }]));
});

test('negation of a constant applies the JVM operation once and renders nested signs safely', () => {
  const stack = new ExprStack();
  stack.push({ kind: 'const', ctype: 'double', value: 1 }, true);
  opsPart.execInstr.call(
    { cls: { cp: {} } } as any,
    { pc: 0, op: 0x77, name: 'dneg', size: 1 },
    stack,
    [],
    {} as any,
  );
  const negated = stack.pop();
  assert.equal(exprStr(negated, {} as any), '-1.0');
  assert.equal(exprStr({ kind: 'unary', op: '-', operand: negated }, {} as any), '-(-1.0)');
});
