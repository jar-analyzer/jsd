import test from 'node:test';
import assert from 'node:assert/strict';
import { intConst, localRef, type Expr, type Stmt } from '../../../src/ast/ast.js';
import { removeUnusedLocals } from '../../../src/decompile/patterns/unused.js';
import { countSlotUses } from '../../../src/decompile/patterns/ternary.js';

const assign = (slot: number, expr: Expr): Stmt => ({
  kind: 'expr',
  expr: { kind: 'assign-expr', target: { kind: 'local', slot, name: `var${slot}` }, expr },
});
const call: Expr = {
  kind: 'invoke',
  mode: 'static',
  owner: 'Example',
  name: 'next',
  descriptor: '()Ljava/lang/String;',
  args: [],
};
const stringSwitch = (subject: Expr): Stmt => ({
  kind: 'switch',
  subject,
  stringMode: true,
  cases: [],
});

test('string switch drops its unused discriminator and adjacent selector copy', () => {
  const source: Stmt[] = [
    assign(7, localRef(0, 'logLevelStr')),
    assign(8, intConst(-1)),
    stringSwitch(localRef(7, 'var7')),
  ];
  assert.deepEqual(removeUnusedLocals(source), [stringSwitch(localRef(0, 'logLevelStr'))]);
});

test('selector calls remain evaluated once at the same position inside try/finally', () => {
  const source: Stmt[] = [
    {
      kind: 'try',
      body: [assign(7, call), assign(8, intConst(-1)), stringSwitch(localRef(7, 'var7'))],
      catches: [],
      finallyS: [{ kind: 'expr', expr: call }],
    },
  ];
  assert.deepEqual(removeUnusedLocals(source), [
    {
      kind: 'try',
      body: [stringSwitch(call)],
      catches: [],
      finallyS: [{ kind: 'expr', expr: call }],
    },
  ]);
});

test('unused pure assignments are cleaned in branches and loops, but effectful values remain', () => {
  const effects: Expr[] = [
    call,
    { kind: 'field-get', owner: 'Example', name: 'value' },
    { kind: 'array-load', array: localRef(0, 'array'), index: intConst(0) },
    { kind: 'cast', jtype: { kind: 'class', name: 'Example' }, expr: localRef(0, 'object') },
    { kind: 'binary', op: '/', left: intConst(1), right: intConst(0) },
  ];
  const kept = effects.map((e, i) => assign(i + 10, e));
  const source: Stmt[] = [
    {
      kind: 'if',
      cond: localRef(0, 'flag'),
      thenS: [assign(1, intConst(-1)), ...kept],
      elseS: [
        {
          kind: 'while',
          cond: localRef(0, 'flag'),
          body: [assign(2, intConst(0)), { kind: 'break' }],
        },
      ],
    },
  ];
  assert.deepEqual(removeUnusedLocals(source), [
    {
      kind: 'if',
      cond: localRef(0, 'flag'),
      thenS: kept,
      elseS: [{ kind: 'while', cond: localRef(0, 'flag'), body: [{ kind: 'break' }] }],
    },
  ]);
});

test('reads in handlers, resources, assignment receivers, and method references prevent removal', () => {
  const ref = localRef(1, 'value');
  const consumers: Stmt[] = [
    {
      kind: 'try',
      body: [],
      catches: [{ type: 'java/lang/Exception', body: [{ kind: 'return', expr: ref }] }],
    },
    { kind: 'try', body: [], catches: [], finallyS: [{ kind: 'return', expr: ref }] },
    {
      kind: 'try',
      body: [],
      catches: [],
      resources: [
        { name: 'resource', slot: 2, jtype: { kind: 'class', name: 'Resource' }, init: ref },
      ],
    },
    {
      kind: 'expr',
      expr: {
        kind: 'assign-expr',
        target: { kind: 'field', owner: 'Example', name: 'x', target: ref },
        expr: intConst(0),
      },
    },
    {
      kind: 'expr',
      expr: {
        kind: 'assign-expr',
        target: { kind: 'array', array: ref, index: intConst(0) },
        expr: intConst(0),
      },
    },
    {
      kind: 'return',
      expr: { kind: 'method-ref', owner: 'Example', name: 'run', descriptor: '()V', target: ref },
    },
    { kind: 'expr', expr: { kind: 'unary', op: 'x++', operand: ref } },
    {
      kind: 'expr',
      expr: {
        kind: 'assign-expr',
        target: ref as Extract<Expr, { kind: 'local' }>,
        op: '+',
        expr: intConst(1),
      },
    },
  ];
  for (const consumer of consumers) {
    const source = [assign(1, intConst(0)), consumer];
    assert.equal(countSlotUses(source, 1).reads, 1);
    assert.deepEqual(removeUnusedLocals(structuredClone(source)), source);
  }
});

test('selector copies with later uses or intervening effects are retained', () => {
  for (const source of [
    [
      assign(7, call),
      stringSwitch(localRef(7, 'var7')),
      { kind: 'return', expr: localRef(7, 'var7') },
    ],
    [assign(7, call), { kind: 'expr', expr: call }, stringSwitch(localRef(7, 'var7'))],
  ] as Stmt[][])
    assert.deepEqual(removeUnusedLocals(structuredClone(source)), source);
});
