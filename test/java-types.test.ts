import test from 'node:test';
import assert from 'node:assert/strict';
import type { Expr } from '../src/ast/ast.js';
import type { JType } from '../src/classfile/types.js';
import { expressionType } from '../src/ast/types.js';
import { declarationValue } from '../src/decompile/java/types.js';

const primitive = (name: Extract<JType, { kind: 'prim' }>['name']): JType => ({
  kind: 'prim',
  name,
});

test('declaration casts distinguish Java widening from signed and unsigned narrowing', () => {
  for (const [from, to, remove] of [
    ['byte', 'char', false],
    ['short', 'char', false],
    ['char', 'short', false],
    ['byte', 'short', true],
    ['char', 'int', true],
    ['int', 'long', true],
    ['long', 'float', true],
    ['float', 'double', true],
    ['double', 'float', false],
  ] as const) {
    const expr: Expr = {
      kind: 'cast',
      jtype: primitive(to),
      expr: { kind: 'local', slot: 1, name: 'value', jtype: primitive(from) },
    };
    const before = structuredClone(expr);
    assert.equal(
      declarationValue(expr, primitive(to)).kind === 'cast',
      !remove,
      `${from} -> ${to}`,
    );
    assert.deepEqual(expr, before);
  }
});

test('constant narrowing never removes floating-point conversions merely because the value is integral', () => {
  for (const ctype of ['float', 'double'] as const) {
    for (const target of ['byte', 'short', 'char', 'int', 'long'] as const) {
      const expr: Expr = {
        kind: 'cast',
        jtype: primitive(target),
        expr: { kind: 'const', ctype, value: 1 },
      };
      assert.equal(declarationValue(expr, primitive(target)).kind, 'cast');
    }
  }
  const expr: Expr = {
    kind: 'cast',
    jtype: primitive('char'),
    expr: { kind: 'const', ctype: 'int', value: 65535 },
  };
  assert.equal(declarationValue(expr, primitive('char')).kind, 'const');
});

test('nested array loads resolve element types through declared locals and method descriptors', () => {
  const array: Expr = { kind: 'local', slot: 3, name: 'values' };
  const index: Expr = { kind: 'const', ctype: 'int', value: 0 };
  const row: Expr = { kind: 'array-load', array, index };
  const value: Expr = { kind: 'array-load', array: row, index, jtype: primitive('int') };
  const type: JType = { kind: 'array', elem: { kind: 'array', elem: primitive('boolean') } };
  assert.deepEqual(
    expressionType(value, (slot) => (slot === 3 ? type : undefined)),
    primitive('boolean'),
  );
  const call: Expr = {
    kind: 'invoke',
    mode: 'static',
    owner: 'Arrays',
    name: 'flags',
    descriptor: '()[Z',
    args: [],
  };
  assert.deepEqual(
    expressionType({ kind: 'array-load', array: call, index, jtype: primitive('int') }),
    primitive('boolean'),
  );
});

test('class literals have Class value type independently of the represented type', () => {
  for (const jtype of [
    { kind: 'class', name: 'java/lang/String' },
    { kind: 'array', elem: { kind: 'prim', name: 'int' } },
  ] as const) {
    assert.deepEqual(expressionType({ kind: 'class-literal', jtype }), {
      kind: 'class',
      name: 'java/lang/Class',
    });
  }
});
