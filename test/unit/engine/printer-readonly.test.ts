import test from 'node:test';
import assert from 'node:assert/strict';
import type { Expr, Stmt } from '../../../src/ast/ast.js';
import { Ctx } from '../../../src/decompile/context.js';
import { parseClass } from '../../../src/classfile/parser.js';
import { renderStmts } from '../../../src/decompile/printer/stmt.js';
import { exprStr } from '../../../src/decompile/printer/expr.js';
import type { RenderCtx } from '../../../src/decompile/printer/context.js';
import { classBytes } from '../../support/class-builder.js';

function context(): RenderCtx {
  const cls = parseClass(
    classBytes('ReadOnly', [
      { name: 'pick', descriptor: '(Ljava/lang/Object;)I', code: [4, 0xac] },
      { name: 'pick', descriptor: '(Ljava/lang/String;)I', code: [5, 0xac] },
    ]),
  );
  return {
    ctx: new Ctx(cls, new Map(), {}),
    className: cls.name,
    slotNames: new Map(),
    slotTypes: new Map(),
    declared: new Set(),
    refs: new Set(),
    scopes: [new Map()],
    returnType: { kind: 'prim', name: 'int' },
  };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('local declaration and return adaptation render a frozen AST repeatedly', () => {
  const stmts: Stmt[] = [
    {
      kind: 'expr',
      expr: {
        kind: 'assign-expr',
        target: { kind: 'local', slot: 1, name: 'flag', jtype: { kind: 'prim', name: 'boolean' } },
        expr: { kind: 'const', ctype: 'int', value: 1 },
      },
    },
    {
      kind: 'return',
      expr: { kind: 'local', slot: 1, name: 'flag', jtype: { kind: 'prim', name: 'boolean' } },
    },
  ];
  const before = structuredClone(stmts);
  freeze(stmts);
  const first = renderStmts(stmts, context(), 0);
  assert.deepEqual(first, ['boolean flag = true;', 'return flag ? 1 : 0;']);
  assert.deepEqual(renderStmts(stmts, context(), 0), first);
  assert.deepEqual(stmts, before);
});

test('overload adaptation formats casts without changing frozen call operands', () => {
  const expr: Expr = {
    kind: 'invoke',
    mode: 'static',
    owner: 'ReadOnly',
    name: 'pick',
    descriptor: '(Ljava/lang/Object;)I',
    args: [{ kind: 'const', ctype: 'string', value: 'x' }],
  };
  const before = structuredClone(expr);
  freeze(expr);
  assert.equal(exprStr(expr, context()), 'pick((java.lang.Object) "x")');
  assert.equal(exprStr(expr, context()), 'pick((java.lang.Object) "x")');
  assert.deepEqual(expr, before);
});

test('concatenation adapts JVM boolean operands without modifying the expression', () => {
  const expr: Expr = {
    kind: 'concat',
    parts: [
      { kind: 'const', ctype: 'string', value: 'flag=' },
      { kind: 'const', ctype: 'int', value: 0 },
    ],
    partTypes: [undefined, { kind: 'prim', name: 'boolean' }],
  };
  const before = structuredClone(expr);
  freeze(expr);
  assert.equal(exprStr(expr, context()), '"flag=" + false');
  assert.deepEqual(expr, before);
});

test('assignments respect declared primitive types over simulation hints', () => {
  for (const [declared, inferred, expected] of [
    ['int', 'boolean', '1'],
    ['boolean', 'int', 'true'],
  ] as const) {
    const stmts: Stmt[] = [
      { kind: 'local-decl', name: 'result', slot: 1, jtype: { kind: 'prim', name: declared } },
      {
        kind: 'expr',
        expr: {
          kind: 'assign-expr',
          target: {
            kind: 'local',
            slot: 1,
            name: 'result',
            jtype: { kind: 'prim', name: inferred },
          },
          expr: { kind: 'const', ctype: 'int', value: 1 },
        },
      },
    ];
    const before = structuredClone(stmts);
    freeze(stmts);
    const rc = context();
    rc.slotTypes.set(1, { kind: 'prim', name: inferred });
    assert.deepEqual(renderStmts(stmts, rc, 0), [`${declared} result;`, `result = ${expected};`]);
    assert.deepEqual(stmts, before);
  }
});

test('builder append chains and concatenations retain string conversion for primitive first operands', () => {
  const parts: Expr[] = [
    { kind: 'const', ctype: 'boolean', value: false },
    { kind: 'const', ctype: 'int', value: 7 },
  ];
  freeze(parts);
  assert.equal(exprStr({ kind: 'concat', parts }, context()), '"" + false + 7');
  assert.equal(exprStr({ kind: 'concat', parts: [] }, context()), '""');
  assert.equal(
    exprStr({ kind: 'sb-chain', parts }, context()),
    'new StringBuilder().append(false).append(7)',
  );
});
