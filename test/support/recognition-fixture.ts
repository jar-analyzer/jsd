import type { Stmt } from '../../src/ast/ast.js';
import { parseClass } from '../../src/classfile/parser.js';
import { decodeBytecode } from '../../src/bytecode/decode.js';
import { buildCFG } from '../../src/bytecode/cfg.js';
import { Ctx } from '../../src/decompile/context.js';
import { Simulator } from '../../src/decompile/simulate/index.js';
import { Structurer } from '../../src/decompile/structure/index.js';
import { RangeGroup, type WalkCtx } from '../../src/decompile/structure/types.js';
import { classBytes } from './class-builder.js';

export function recognitionFixture() {
  const cls = parseClass(classBytes('Recognition', [{ name: 'value', code: [4, 0xac] }]));
  const method = cls.methods[0];
  const cfg = buildCFG(decodeBytecode(method.code!.code), new Set());
  const ctx = new Ctx(cls, new Map(), {});
  const sim = Simulator.run(ctx, cls, method, cfg, method.code!.maxLocals);
  const state = new Structurer(ctx, cls, method, cfg, sim);
  const group = new RangeGroup(0, 2, [{ startPc: 0, endPc: 1, handlerPc: 1, catchType: null }]);
  state.rangeGroups.push(group);
  state.rangeByStart.set(0, [group]);
  const statement: Stmt = { kind: 'while', cond: null, body: [{ kind: 'return' }] };
  const outer: Stmt[] = [statement];
  state.pendingMonitors.push({ arr: outer, slot: 1, used: false });
  const wctx: WalkCtx = {
    implicitEnds: new Set(),
    breakables: [{ kind: 'loop', exits: new Set([3]), naturalExit: 3, stmt: statement }],
  };
  const inputs = [outer, wctx];
  const snapshot = () =>
    structuredClone({
      sim: state.sim,
      group,
      outer,
      wctx,
      claimed: state.claimed,
      pending: state.pendingMonitors,
      consumed: state.consumedHandlerPcs,
      loops: state.structuredLoops,
      labels: state.usedLabels,
    });
  const mutate = () => {
    group.done = true;
    group.handlers.splice(0, 1);
    group.consumedHandlers.add(1);
    state.claimed[4] = true;
    state.consumedHandlerPcs.add(1);
    state.structuredLoops.add(0);
    state.usedLabels++;
    state.sim.stmts[0].push({ kind: 'return' });
    state.sim.stmts = [];
    statement.label = 'changed';
    statement.body.splice(0, 1);
    outer.splice(0, 1);
    wctx.breakables[0].exits.add(8);
    state.pendingMonitors[0].used = true;
  };
  return { state, group, outer, statement, wctx, inputs, snapshot, mutate };
}
