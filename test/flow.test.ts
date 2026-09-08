import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClass } from '../src/classfile/parser.js';
import { decodeBytecode } from '../src/bytecode/decode.js';
import { buildCFG } from '../src/bytecode/cfg.js';
import { Ctx } from '../src/decompile/context.js';
import { Simulator } from '../src/decompile/simulate/index.js';
import { runWorklist } from '../src/decompile/simulate/worklist.js';
import { sameValue } from '../src/decompile/simulate/equality.js';
import type { Expr } from '../src/ast/ast.js';
import { classBytes } from './class-builder.js';

function simulate(code: number[], reverse = false) {
  const cls = parseClass(classBytes('Flow', [{ name: 'value', code }]));
  const method = cls.methods[0];
  const cfg = buildCFG(decodeBytecode(method.code!.code), new Set());
  if (reverse) cfg.rpo.reverse();
  const ctx = new Ctx(cls, new Map(), {});
  return { ctx, method, cfg, sim: Simulator.run(ctx, cls, method, cfg, method.code!.maxLocals) };
}

function constantValue(expr: Expr): number {
  if (expr.kind === 'const' && typeof expr.value === 'number') return expr.value;
  if (expr.kind === 'binary' && expr.op === '+')
    return constantValue(expr.left) + constantValue(expr.right);
  throw new Error('expected an integer constant expression');
}

test('simulation follows dependencies through a long chain in reverse block order', () => {
  const code = [4, 0xa7, 0, 3];
  for (let i = 0; i < 24; i++) code.push(4, 0x60, 0xa7, 0, 3);
  code.push(0xac);
  const { sim } = simulate(code, true);
  assert.equal(sim.failed, undefined);
  const result = sim.terms.at(-1)!;
  assert.equal(result.t, 'return');
  if (result.t !== 'return' || !result.expr) throw new Error('missing return');
  assert.equal(constantValue(result.expr), 25);
  assert.equal(sim.entryStack.at(-1)!.depth, 1);
});

test('loop merge assignments use the latest predecessor expression after convergence', () => {
  const { cfg, sim } = simulate([
    3, 0xa7, 0, 3, 0x59, 8, 0xa2, 0, 8, 4, 0x60, 0xa7, 0xff, 0xf9, 0xac,
  ]);
  assert.equal(sim.failed, undefined);
  const result = sim.terms.at(-1)!;
  if (result.t !== 'return' || result.expr?.kind !== 'local')
    throw new Error('expected merged return');
  const slot = result.expr.slot;
  const back = sim.stmts[cfg.byStart.get(9)!].at(-1)!;
  if (back.kind !== 'expr' || back.expr.kind !== 'assign-expr' || back.expr.target.kind !== 'local')
    throw new Error('missing edge assignment');
  assert.equal(back.expr.target.slot, slot);
  const value = back.expr.expr;
  if (value.kind !== 'binary' || value.left.kind !== 'local') throw new Error('stale merge input');
  assert.equal(value.left.slot, slot);
  assert.equal(value.op, '+');
});

test('worklists deduplicate pending nodes and fail explicitly when convergence exceeds the budget', () => {
  let visits = 0;
  assert.equal(
    runWorklist(
      [0, 0],
      () => {
        visits++;
        return [];
      },
      1,
    ),
    1,
  );
  assert.equal(visits, 1);
  assert.throws(() => runWorklist([0], () => [0], 8), /did not converge/);
});

test('equivalent inferred types do not create additional solver revisions', () => {
  const { ctx, method } = simulate([3, 0xac]);
  const before = ctx.slotTypeRevision(method);
  ctx.recordSlotType(method, 8, { kind: 'array', elem: { kind: 'prim', name: 'int' } });
  ctx.recordSlotType(method, 8, { kind: 'array', elem: { kind: 'prim', name: 'int' } });
  assert.equal(ctx.slotTypeRevision(method), before + 1);
});

test('convergence equality preserves signed zero, NaN and bigint precision', () => {
  assert.equal(sameValue([{ value: -0 }], [{ value: 0 }]), false);
  assert.equal(sameValue([{ value: NaN }], [{ value: NaN }]), true);
  assert.equal(sameValue({ value: 9007199254740992n }, { value: 9007199254740993n }), false);
});
