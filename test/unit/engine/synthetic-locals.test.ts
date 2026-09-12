import test from 'node:test';
import assert from 'node:assert/strict';
import { type Expr, type Stmt, intConst, localRef } from '../../../src/ast/ast.js';
import type { JType } from '../../../src/classfile/types.js';
import { simplifySyntheticLocals } from '../../../src/decompile/patterns/synthetic-locals.js';
import { decompileClassFile } from '../../../src/index.js';
import { classBytes } from '../../support/class-builder.js';

const intType: JType = { kind: 'prim', name: 'int' };
const objectType: JType = { kind: 'class', name: 'java/lang/Object' };
const local = (slot: number, type = intType): Expr => localRef(slot, `value${slot}`, type);
const assign = (slot: number, value: Expr, type = intType, temporary = true): Stmt => ({
  kind: 'expr',
  expr: {
    kind: 'assign-expr',
    target: { kind: 'local', slot, name: `value${slot}`, jtype: type, temporary },
    expr: value,
  },
});
const call = (name = 'next', descriptor = '()I', args: Expr[] = []): Expr => ({
  kind: 'invoke',
  mode: 'static',
  owner: 'Example',
  name,
  descriptor,
  args,
});
const ret = (expr: Expr): Stmt => ({ kind: 'return', expr });

test('synthetic copies collapse without changing user-declared copies or their names', () => {
  assert.deepEqual(simplifySyntheticLocals([assign(1, local(0)), ret(local(1))]), [ret(local(0))]);
  const user = [assign(1, local(0), intType, false), ret(local(1))];
  assert.equal(simplifySyntheticLocals(user), user);
});

test('copies cross unrelated effects but retain snapshots before source writes', () => {
  const effect: Stmt = { kind: 'expr', expr: call() };
  assert.deepEqual(simplifySyntheticLocals([assign(1, local(0)), effect, ret(local(1))]), [
    effect,
    ret(local(0)),
  ]);
  const snapshot = [assign(1, local(0)), assign(0, intConst(7), intType, false), ret(local(1))];
  assert.equal(simplifySyntheticLocals(snapshot), snapshot);
});

test('writes in receivers and array indices keep earlier local versions', () => {
  for (const expr of [
    call('consume', '(II)I', [{ kind: 'unary', op: 'x++', operand: local(0) }, local(1)]),
    {
      kind: 'assign-expr',
      target: {
        kind: 'array',
        array: local(2, { kind: 'array', elem: intType }),
        index: { kind: 'unary', op: 'x++', operand: local(0) },
      },
      expr: local(1),
    } as Expr,
    {
      kind: 'assign-expr',
      target: {
        kind: 'field',
        owner: 'Example',
        name: 'x',
        target: call('receiver', '(I)LExample;', [{ kind: 'unary', op: 'x++', operand: local(0) }]),
      },
      expr: local(1),
    } as Expr,
  ]) {
    const source = [assign(1, local(0)), { kind: 'expr', expr } as Stmt];
    assert.equal(simplifySyntheticLocals(source), source);
  }
});

test('an adjacent first-evaluated call is inlined once', () => {
  const value = call();
  const sum: Expr = {
    kind: 'binary',
    op: '+',
    left: local(1),
    right: call('later'),
    jtype: intType,
  };
  assert.deepEqual(simplifySyntheticLocals([assign(1, value), ret(sum)]), [
    ret({ ...sum, left: value }),
  ]);
});

test('effects cannot cross earlier arguments, unrelated statements, or allocations', () => {
  const consumers: Expr[] = [
    { kind: 'binary', op: '+', left: call('earlier'), right: local(1), jtype: intType },
    call('consume', '(II)I', [intConst(0), local(1)]),
    { kind: 'new', owner: 'Example', descriptor: '(I)V', args: [local(1)] },
    { kind: 'concat', parts: [local(1)], partTypes: [intType] },
    {
      kind: 'ternary',
      cond: { kind: 'const', ctype: 'boolean', value: true },
      thenE: local(1),
      elseE: intConst(0),
    },
  ];
  for (const consumer of consumers) {
    const source = [assign(1, call()), ret(consumer)];
    assert.equal(simplifySyntheticLocals(source), source);
  }
  const source = [assign(1, call()), { kind: 'expr', expr: call('other') } as Stmt, ret(local(1))];
  assert.equal(simplifySyntheticLocals(source), source);
});

test('unused calls retain their evaluation and exceptions without a receiving variable', () => {
  const value = call();
  assert.deepEqual(simplifySyntheticLocals([assign(1, value)]), [{ kind: 'expr', expr: value }]);
});

test('unused unboxing, casts, array accesses, and divisions remain evaluated', () => {
  for (const value of [
    { kind: 'cast', jtype: intType, expr: local(0, { kind: 'class', name: 'java/lang/Integer' }) },
    {
      kind: 'array-load',
      array: local(0, { kind: 'array', elem: intType }),
      index: intConst(0),
      jtype: intType,
    },
    { kind: 'binary', op: '/', left: intConst(1), right: local(0), jtype: intType },
  ] as Expr[]) {
    const source = [assign(1, value)];
    assert.equal(simplifySyntheticLocals(source), source);
  }
});

test('reference substitutions retain the static type of the temporary', () => {
  const value = call('generic', '()Ljava/lang/Object;');
  assert.deepEqual(
    simplifySyntheticLocals([assign(1, value, objectType), ret(local(1, objectType))]),
    [ret({ kind: 'cast', jtype: objectType, expr: value })],
  );
});

test('type changes, annotations, and floating-point stores prevent propagation', () => {
  const annotated: JType = { ...intType, annotations: [{ typeName: 'Mark', pairs: [] }] };
  const doubleType: JType = { kind: 'prim', name: 'double' };
  for (const source of [
    [assign(1, local(0, { kind: 'prim', name: 'byte' })), ret(local(1))],
    [assign(1, local(0), annotated), ret(local(1, annotated))],
    [assign(1, call('number', '()D'), doubleType), ret(local(1, doubleType))],
    [assign(1, call()), ret(local(1, { kind: 'prim', name: 'long' }))],
  ])
    assert.equal(simplifySyntheticLocals(source), source);
});

test('reused results and multiple definitions are not duplicated or conflated', () => {
  const sum: Expr = { kind: 'binary', op: '+', left: local(1), right: local(1), jtype: intType };
  const repeated = [assign(1, call()), ret(sum)];
  assert.equal(simplifySyntheticLocals(repeated), repeated);
  const overwritten = [assign(1, call()), assign(1, call('other')), ret(local(1))];
  assert.equal(simplifySyntheticLocals(overwritten), overwritten);
});

test('branch, loop, synchronization, and exception boundaries stop movement', () => {
  const boundaries: Stmt[] = [
    { kind: 'if', cond: intConst(1), thenS: [ret(local(1))] },
    { kind: 'while', cond: null, body: [ret(local(1))] },
    { kind: 'sync', monitor: local(0, objectType), body: [ret(local(1))] },
    { kind: 'try', body: [ret(local(1))], catches: [], finallyS: [{ kind: 'expr', expr: call() }] },
  ];
  for (const boundary of boundaries) {
    const source = [assign(1, call()), boundary];
    assert.equal(simplifySyntheticLocals(source), source);
  }
});

test('block-local cleanup inside handlers and loops stays inside those blocks', () => {
  const body = [assign(1, call()), ret(local(1))];
  const source: Stmt[] = [
    { kind: 'try', body: [], catches: [{ type: 'java/lang/Exception', body }], finallyS: [] },
  ];
  assert.deepEqual(simplifySyntheticLocals(source), [
    {
      kind: 'try',
      body: [],
      catches: [{ type: 'java/lang/Exception', body: [ret(call())] }],
      finallyS: [],
    },
  ]);
});

test('lambda captures, raw expressions, and bad statements are conservative boundaries', () => {
  const boundaries: Stmt[] = [
    { kind: 'expr', expr: { kind: 'lambda', params: [], body: [], exprBody: local(1) } },
    { kind: 'expr', expr: { kind: 'raw', text: 'opaque()' } },
    { kind: 'bad', text: 'opaque' },
    {
      kind: 'try',
      body: [],
      catches: [],
      resources: [
        { slot: 2, name: 'r', jtype: objectType, init: { kind: 'raw', text: 'opaque()' } },
      ],
    },
  ];
  for (const boundary of boundaries) {
    const source = [assign(1, call()), ret(local(1)), boundary];
    assert.equal(simplifySyntheticLocals(source), source);
  }
});

test('copy chains reach a fixed point without mutating the input', () => {
  const source = [assign(1, local(0)), assign(2, local(1)), ret(local(2))];
  const before = structuredClone(source);
  const result = simplifySyntheticLocals(source);
  assert.deepEqual(result, [ret(local(0))]);
  assert.deepEqual(source, before);
  assert.equal(simplifySyntheticLocals(result), result);
});

test('synthetic cleanup charges repeated analysis to the work budget', () => {
  assert.throws(
    () =>
      simplifySyntheticLocals([assign(1, call()), ret(local(1))], () => {
        throw new Error('budget');
      }),
    /budget/,
  );
});

test('real bytecode loses a redundant duplication temporary in arithmetic', () => {
  const report = decompileClassFile(
    classBytes('SimpleDuplicate', [
      { name: 'value', descriptor: '(I)I', code: [0x1a, 0x04, 0x60, 0x59, 0x3c, 0x05, 0x68, 0xac] },
    ]),
    { banner: false },
  );
  assert.equal(report.status, 'success');
  assert.ok(report.source.replace(/\s/g, '').includes('return(arg0+1)*2;'));
  assert.doesNotMatch(report.source, /\bint \w+\s*=/);
});

test('copies feeding constructors and method references remain capture snapshots', () => {
  const object = local(0, objectType);
  for (const consumer of [
    {
      kind: 'new',
      owner: 'Example$1',
      descriptor: '(Ljava/lang/Object;)V',
      args: [local(1, objectType)],
    },
    {
      kind: 'method-ref',
      owner: 'java/lang/Object',
      name: 'toString',
      descriptor: '()Ljava/lang/String;',
      target: local(1, objectType),
    },
  ] as Expr[]) {
    const source = [assign(1, object, objectType), ret(consumer)];
    assert.equal(simplifySyntheticLocals(source), source);
  }
});
