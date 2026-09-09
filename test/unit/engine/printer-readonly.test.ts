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

test('external fluent calls apply each receiver/result cast only once', () => {
  const builder = 'example/Builder';
  let expr: Expr = {
    kind: 'invoke',
    mode: 'static',
    owner: 'example/Commander',
    name: 'newBuilder',
    descriptor: `()L${builder};`,
    args: [],
  };
  for (let i = 0; i < 3; i++)
    expr = {
      kind: 'invoke',
      mode: 'virtual',
      owner: builder,
      name: 'addCommand',
      descriptor: `(Ljava/lang/Object;)L${builder};`,
      target: expr,
      args: [{ kind: 'const', ctype: 'string', value: `command${i}` }],
    };
  const before = structuredClone(expr);
  freeze(expr);
  const output = exprStr(expr, context());
  assert.equal((output.match(/\(example\.Builder\)/g) ?? []).length, 4);
  assert.equal(
    output.replace(/\s/g, ''),
    '(example.Builder) ((example.Builder) ((example.Builder) ((example.Builder) example.Commander.newBuilder()).addCommand((java.lang.Object) "command0")).addCommand((java.lang.Object) "command1")).addCommand((java.lang.Object) "command2")'.replace(
      /\s/g,
      '',
    ),
  );
  assert.equal(exprStr(expr, context()), output);
  assert.deepEqual(expr, before);
});

test('raw local receivers avoid extra casts while parameterized receivers keep erasure', () => {
  for (const parameterized of [false, true]) {
    const expr: Expr = {
      kind: 'invoke',
      mode: 'virtual',
      owner: 'example/Builder',
      name: 'add',
      descriptor: '(Ljava/lang/Object;)V',
      target: {
        kind: 'local',
        slot: 1,
        name: 'builder',
        jtype: {
          kind: 'class',
          name: 'example/Builder',
          ...(parameterized
            ? { args: [{ kind: 'class' as const, name: 'java/lang/String' }] }
            : {}),
        },
      },
      args: [{ kind: 'const', ctype: 'string', value: 'command' }],
    };
    const output = exprStr(expr, context());
    assert.equal(output.includes('(example.Builder)'), parameterized);
    assert.match(output, /add\(\(java.lang.Object\) "command"\)/);
  }
});

test('identical raw casts collapse but intervening checked and generic casts remain', () => {
  const type = { kind: 'class' as const, name: 'example/Builder' };
  const value: Expr = { kind: 'local', slot: 1, name: 'value' };
  const cast = (expr: Expr): Expr => ({ kind: 'cast', jtype: type, expr });
  const expr = cast(cast(cast(value)));
  freeze(expr);
  assert.equal(exprStr(expr, context()), '(example.Builder) var1');
  for (const intermediate of [
    { kind: 'class' as const, name: 'example/Other' },
    { ...type, args: [{ kind: 'class' as const, name: 'java/lang/String' }] },
  ]) {
    const output = exprStr(cast({ kind: 'cast', jtype: intermediate, expr: value }), context());
    assert.equal((output.match(/\) /g) ?? []).length, 2);
  }
});

test('named locals reusing a slot do not inherit another variable type', () => {
  const stmts: Stmt[] = [
    {
      kind: 'if',
      cond: { kind: 'const', ctype: 'boolean', value: true },
      thenS: [
        {
          kind: 'expr',
          expr: {
            kind: 'assign-expr',
            target: {
              kind: 'local',
              slot: 1,
              name: 'ok',
              jtype: { kind: 'prim', name: 'boolean' },
            },
            expr: { kind: 'const', ctype: 'int', value: 1 },
          },
        },
      ],
    },
    {
      kind: 'expr',
      expr: {
        kind: 'assign-expr',
        target: {
          kind: 'local',
          slot: 1,
          name: 'commander',
          jtype: { kind: 'class', name: 'Commander' },
        },
        expr: { kind: 'new', owner: 'Commander', args: [] },
      },
    },
  ];
  const output = renderStmts(stmts, context(), 0).join('\n');
  assert.match(output, /Commander commander = new Commander\(\);/);
  assert.doesNotMatch(output, /commander2/);
});

test('block lambdas retain nested statements and enclosing indentation', () => {
  const call = (name: string, args: Expr[] = []): Expr => ({
    kind: 'invoke',
    mode: 'static',
    owner: 'ReadOnly',
    name,
    descriptor: args.length ? '(Ljava/lang/Runnable;)V' : '()V',
    args,
  });
  const lambda: Expr = {
    kind: 'lambda',
    params: [],
    body: [
      {
        kind: 'if',
        cond: { kind: 'const', ctype: 'boolean', value: true },
        thenS: [{ kind: 'expr', expr: call('show') }, { kind: 'return' }],
      },
      { kind: 'expr', expr: call('finish') },
    ],
  };
  const source: Stmt[] = [
    {
      kind: 'expr',
      expr: call('listen', [
        { kind: 'cast', jtype: { kind: 'class', name: 'java/lang/Runnable' }, expr: lambda },
      ]),
    },
  ];
  const before = structuredClone(source);
  freeze(source);
  assert.equal(
    renderStmts(source, context(), 2).join('\n'),
    [
      '        listen((java.lang.Runnable) (() -> {',
      '            if (true) {',
      '                show();',
      '                return;',
      '            }',
      '            finish();',
      '        }));',
    ].join('\n'),
  );
  assert.deepEqual(source, before);
});

test('nested block lambdas accumulate one indentation level per body', () => {
  const inner: Expr = { kind: 'lambda', params: [], body: [{ kind: 'return' }] };
  const expr: Expr = {
    kind: 'lambda',
    params: [],
    body: [
      {
        kind: 'expr',
        expr: {
          kind: 'invoke',
          mode: 'static',
          owner: 'ReadOnly',
          name: 'listen',
          descriptor: '(Ljava/lang/Runnable;)V',
          args: [inner],
        },
      },
    ],
  };
  assert.equal(
    exprStr(expr, context()),
    ['() -> {', '    listen(() -> {', '        return;', '    });', '}'].join('\n'),
  );
});
