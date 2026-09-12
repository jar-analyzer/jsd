import test from 'node:test';
import assert from 'node:assert/strict';
import type { Expr } from '../../../src/ast/ast.js';
import type { JType } from '../../../src/classfile/types.js';
import { parseClass } from '../../../src/classfile/parser.js';
import { Ctx } from '../../../src/decompile/context.js';
import { prepareExpression } from '../../../src/decompile/java/expressions.js';
import { classBytes } from '../../support/class-builder.js';

const string: JType = { kind: 'class', name: 'java/lang/String' };
const value: Expr = { kind: 'const', ctype: 'string', value: 'value' };
const cls = parseClass(classBytes('CollectionCalls', []));
const ctx = new Ctx(cls, new Map());

function call(
  owner: string,
  name: string,
  descriptor: string,
  args: Expr[],
  typeArgs?: JType[],
): Extract<Expr, { kind: 'invoke' }> {
  return {
    kind: 'invoke',
    mode: 'interface',
    owner,
    name,
    descriptor,
    args,
    target: {
      kind: 'local',
      slot: 1,
      name: 'values',
      jtype: { kind: 'class', name: owner, args: typeArgs },
    },
  };
}

function prepared(e: Extract<Expr, { kind: 'invoke' }>) {
  const before = structuredClone(e);
  const result = prepareExpression(e, ctx);
  assert.equal(result.kind, 'invoke');
  assert.deepEqual(e, before);
  if (result.kind !== 'invoke') throw new Error('Expected invocation');
  return result;
}

test('collection insertion keeps typed and raw receivers and arguments without casts', () => {
  for (const owner of [
    'List',
    'ArrayList',
    'Collection',
    'Set',
    'HashSet',
    'Queue',
    'LinkedList',
  ]) {
    for (const args of [undefined, [string]]) {
      const e = call('java/util/' + owner, 'add', '(Ljava/lang/Object;)Z', [value], args);
      const out = prepared(e);
      assert.equal(out.target, e.target);
      assert.deepEqual(out.args, e.args);
    }
  }
});

test('map insertion accepts array values and interface receivers', () => {
  const array: Expr = { kind: 'array-init', elemType: { kind: 'prim', name: 'int' }, values: [] };
  const e = call(
    'java/util/HashMap',
    'put',
    '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;',
    [value, array],
  );
  e.target = {
    kind: 'local',
    slot: 1,
    name: 'map',
    jtype: {
      kind: 'class',
      name: 'java/util/Map',
      args: [string, { kind: 'array', elem: { kind: 'prim', name: 'int' } }],
    },
  };
  const out = prepared(e);
  assert.equal(out.target, e.target);
  assert.deepEqual(out.args, e.args);
  assert.equal(out.eraseResult, true);
});

test('collection insertion preserves erasure for incompatible and upper-bounded element types', () => {
  for (const arg of [
    { kind: 'class', name: 'java/lang/Integer' },
    { kind: 'wildcard', bound: string },
  ] as JType[]) {
    const e = call('java/util/List', 'add', '(Ljava/lang/Object;)Z', [value], [arg]);
    assert.equal(prepared(e).args[0].kind, 'cast');
    assert.equal(prepared(e).target?.kind, 'cast');
  }
  const inner: JType = {
    kind: 'class',
    name: 'example/Outer$Inner',
    owner: { kind: 'class', name: 'example/Outer', args: [string] },
  };
  const e = call(
    'java/util/List',
    'add',
    '(Ljava/lang/Object;)Z',
    [{ kind: 'local', slot: 2, name: 'inner', jtype: { kind: 'class', name: inner.name } }],
    [inner],
  );
  assert.equal(prepared(e).args[0].kind, 'cast');
});

test('collection insertion supports lower bounds and null wildcard elements', () => {
  const lower = call(
    'java/util/List',
    'add',
    '(Ljava/lang/Object;)Z',
    [value],
    [{ kind: 'wildcard', superBound: string }],
  );
  assert.equal(prepared(lower).args[0], value);
  const nullable = call(
    'java/util/List',
    'add',
    '(Ljava/lang/Object;)Z',
    [{ kind: 'const', ctype: 'null', value: null }],
    [{ kind: 'wildcard' }],
  );
  assert.equal(prepared(nullable).args[0], nullable.args[0]);
});

test('list removal distinguishes reference widening from primitive overload selection', () => {
  const e = call('java/util/List', 'remove', '(Ljava/lang/Object;)Z', [value], [string]);
  assert.equal(prepared(e).args[0], value);
  e.args = [{ kind: 'const', ctype: 'int', value: 0 }];
  assert.equal(prepared(e).args[0].kind, 'cast');
  const queue = call('java/util/Queue', 'remove', '(Ljava/lang/Object;)Z', [value]);
  queue.target = {
    kind: 'local',
    slot: 1,
    name: 'queue',
    jtype: { kind: 'class', name: 'java/util/LinkedList' },
  };
  assert.equal(prepared(queue).args[0], value);
});

test('unknown collection subclasses and unknown descriptors retain overload protection', () => {
  const e = call('example/CustomList', 'add', '(Ljava/lang/Object;)Z', [value]);
  assert.equal(prepared(e).args[0].kind, 'cast');
  e.owner = 'java/util/List';
  assert.equal(prepared(e).args[0].kind, 'cast');
  const unexpected = call('java/util/List', 'add', '(Ljava/lang/Object;)Ljava/lang/Object;', [
    value,
  ]);
  assert.equal(prepared(unexpected).args[0].kind, 'cast');
  const bounded = call(
    'java/util/EnumMap',
    'put',
    '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;',
    [value, value],
  );
  assert.equal(prepared(bounded).args[0].kind, 'cast');
});

test('collection reads preserve erased return types for enclosing overload resolution', () => {
  const e = call(
    'java/util/List',
    'get',
    '(I)Ljava/lang/Object;',
    [{ kind: 'const', ctype: 'int', value: 0 }],
    [string],
  );
  assert.equal(prepared(e).eraseResult, true);
  const map = call(
    'java/util/Map',
    'get',
    '(Ljava/lang/Object;)Ljava/lang/Object;',
    [value],
    [string, string],
  );
  assert.equal(prepared(map).eraseResult, true);
  assert.equal(prepared(map).args[0], value);
});

test('collection cleanup retains explicit receiver casts and argument casts', () => {
  const e = call('java/util/List', 'add', '(Ljava/lang/Object;)Z', [
    { kind: 'cast', jtype: { kind: 'class', name: 'java/lang/Object' }, expr: value },
  ]);
  e.target = {
    kind: 'cast',
    jtype: { kind: 'class', name: 'java/util/List' },
    expr: {
      kind: 'local',
      slot: 1,
      name: 'object',
      jtype: { kind: 'class', name: 'java/lang/Object' },
    },
  };
  const out = prepared(e);
  assert.equal(out.target, e.target);
  assert.equal(out.args[0], e.args[0]);
  e.args = [value];
  e.target.intersectionTypes = [
    { kind: 'class', name: 'java/util/List' },
    { kind: 'class', name: 'example/Overloaded' },
  ];
  assert.equal(prepared(e).args[0].kind, 'cast');
});
