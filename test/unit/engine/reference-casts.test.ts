import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClass } from '../../../src/classfile/parser.js';
import type { JType } from '../../../src/classfile/types.js';
import type { Expr } from '../../../src/ast/ast.js';
import { Ctx } from '../../../src/decompile/context.js';
import { exprStr } from '../../../src/decompile/printer/expr.js';
import { needsReferenceCastBridge } from '../../../src/decompile/java/reference-casts.js';
import { prepareExpression, prepareReturnValue } from '../../../src/decompile/java/expressions.js';
import { classBytes } from '../../support/class-builder.js';

const type = (name: string): JType => ({ kind: 'class', name });
const array = (elem: JType): JType => ({ kind: 'array', elem });
const string = type('java/lang/String');
const object = type('java/lang/Object');
function context(): Ctx {
  return new Ctx(parseClass(classBytes('CastChecks', [])), new Map());
}

test('disjoint final and unresolved reference types require a source-level cast bridge', () => {
  const ctx = context();
  for (const target of ['java/util/List', 'java/lang/Integer', 'java/lang/Number'])
    assert.equal(needsReferenceCastBridge(string, type(target), ctx), true);
  assert.equal(needsReferenceCastBridge(type('example/A'), type('example/B'), ctx), true);
});

test('known reference supertypes retain direct casts', () => {
  const ctx = context();
  for (const target of ['java/lang/Object', 'java/lang/CharSequence', 'java/io/Serializable']) {
    assert.equal(needsReferenceCastBridge(string, type(target), ctx), false);
    assert.equal(needsReferenceCastBridge(type(target), string, ctx), false);
  }
  const parent = parseClass(classBytes('Parent', []));
  const child = parseClass(classBytes('Child', []));
  child.superName = parent.name;
  ctx.classes.set(parent.name, parent);
  ctx.classes.set(child.name, child);
  assert.equal(needsReferenceCastBridge(type('Child'), type('Parent'), ctx), false);
  assert.equal(needsReferenceCastBridge(type('Parent'), type('Child'), ctx), false);
});

test('array casts distinguish dimensions, primitive elements and array marker interfaces', () => {
  const ctx = context();
  const ints = array({ kind: 'prim', name: 'int' });
  assert.equal(needsReferenceCastBridge(ints, array({ kind: 'prim', name: 'long' }), ctx), true);
  assert.equal(
    needsReferenceCastBridge(array(string), array(type('java/lang/Integer')), ctx),
    true,
  );
  assert.equal(needsReferenceCastBridge(array(ints), array(object), ctx), false);
  assert.equal(needsReferenceCastBridge(ints, array(object), ctx), true);
  for (const name of ['java/lang/Object', 'java/lang/Cloneable', 'java/io/Serializable']) {
    assert.equal(needsReferenceCastBridge(ints, type(name), ctx), false);
    assert.equal(needsReferenceCastBridge(type(name), ints, ctx), false);
  }
  assert.equal(needsReferenceCastBridge(ints, string, ctx), true);
});

test('generic return adaptation restores type-variable and generic-array source casts', () => {
  const variable: JType = { kind: 'typevar', name: 'T' };
  const value: Expr = { kind: 'const', ctype: 'string', value: 'value' };
  assert.deepEqual(prepareReturnValue(value, variable), {
    kind: 'cast',
    jtype: variable,
    expr: value,
  });
  const input: Expr = { kind: 'local', slot: 1, name: 'value', jtype: array(object) };
  assert.deepEqual(prepareReturnValue(input, array(variable)), {
    kind: 'cast',
    jtype: array(variable),
    expr: input,
  });
  assert.equal(prepareReturnValue(value, object), value);
});

test('boolean call adaptation uses emitted local declaration types without mutating operands', () => {
  const value: Expr = { kind: 'local', slot: 1, name: 'merged' };
  const call: Expr = {
    kind: 'invoke',
    mode: 'static',
    owner: 'CastChecks',
    name: 'accept',
    descriptor: '(Z)V',
    args: [value],
  };
  const before = structuredClone(call);
  const prepared = prepareExpression(
    call,
    context(),
    undefined,
    new Map([[1, { kind: 'prim', name: 'int' }]]),
  );
  assert.equal(prepared.kind, 'invoke');
  if (prepared.kind === 'invoke')
    assert.deepEqual(prepared.args[0], {
      kind: 'binary',
      op: '!=',
      left: value,
      right: { kind: 'const', ctype: 'int', value: 0 },
    });
  assert.deepEqual(call, before);
});

test('intersection casts restore the Object bridge without mutating checked operands', () => {
  const runnable = type('java/lang/Runnable');
  const serializable = type('java/io/Serializable');
  const value: Expr = {
    kind: 'cast',
    jtype: runnable,
    intersectionTypes: [runnable, serializable],
    expr: {
      kind: 'cast',
      jtype: serializable,
      expr: { kind: 'const', ctype: 'string', value: 'wrong' },
    },
  };
  const before = structuredClone(value);
  const source = exprStr(value, {
    ctx: context(),
    className: 'CastChecks',
    slotNames: new Map(),
    slotTypes: new Map(),
    declared: new Set(),
    refs: new Set(),
    scopes: [new Map()],
  });
  assert.equal(source, '(java.lang.Runnable & java.io.Serializable) ((java.lang.Object) "wrong")');
  assert.deepEqual(value, before);
});
