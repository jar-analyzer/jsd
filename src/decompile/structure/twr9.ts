import { Expr, Stmt } from '../../ast/ast.js';
import type { JType } from '../../classfile/types.js';
import type { RangeGroup, WalkCtx, RecoveredStatement } from './types.js';
import { inferInitTypeSimple, stripResourceCloses } from './stmtstrip.js';
import type { Structurer } from './index.js';

import { isResourceHandler } from './resource-handler.js';
export function detectTwr9(
  state: Structurer,
  group: RangeGroup,
  nodes: Set<number>,
  outerStmts: Stmt[],
  wctx: WalkCtx,
): RecoveredStatement | null {
  if (group.handlers.length !== 1 || group.handlers[0].catchType !== 'java/lang/Throwable')
    return null;
  const h1 = group.handlers[0];
  const hb1 = state.blockOfPc(h1.handlerPc);
  if (hb1 < 0 || state.claimed[hb1]) return null;
  const region1 = state.handlerOwned(hb1, state.allNodes());
  if (!region1.has(hb1) || region1.size < 2) return null;
  for (const b of region1) {
    for (const sc of state.cfg.blocks[b].succs) if (!region1.has(sc)) return null;
  }
  const st1 = state.sim.stmts[hb1];
  if (!st1.length) return null;
  const f1 = st1[0];
  if (!(
    f1.kind === 'expr' &&
    f1.expr.kind === 'assign-expr' &&
    f1.expr.target.kind === 'local' &&
    (f1.expr.expr as { text?: string }).text === '@exception'
  ))
    return null;
  const tSlot = (f1.expr.target as { slot: number }).slot;
  let sawThrow = false;
  for (const b of region1) {
    const t = state.t(b);
    if (t.t === 'throw') {
      if (t.expr.kind !== 'local' || (t.expr as { slot: number }).slot !== tSlot) return null;
      sawThrow = true;
    } else if (t.t !== 'if' && t.t !== 'goto' && t.t !== 'none') return null;
  }
  if (!sawThrow) return null;
  let h1End = 0;
  for (const b of region1) h1End = Math.max(h1End, state.cfg.blocks[b].endPc);
  const resSlots = new Set<number>();
  let suppressed = false;
  for (const b of state.allNodes()) {
    const pc = state.cfg.blocks[b].startPc;
    if (pc < h1.handlerPc || pc >= h1End) continue;
    for (const s of state.sim.stmts[b]) {
      if (s.kind !== 'expr' || s.expr.kind !== 'invoke') continue;
      if (s.expr.name === 'close' && s.expr.target?.kind === 'local')
        resSlots.add((s.expr.target as { slot: number }).slot);
      if (
        s.expr.name === 'addSuppressed' &&
        s.expr.target?.kind === 'local' &&
        (s.expr.target as { slot: number }).slot === tSlot
      )
        suppressed = true;
    }
  }
  if (resSlots.size !== 1 || !suppressed) return null;
  const resSlot = [...resSlots][0];

  const bodyGroups = state.rangeGroups.filter(
    (g2) =>
      (g2 === group || !g2.done) &&
      g2.handlers.length > 0 &&
      g2.handlers.every((x) => x.handlerPc === h1.handlerPc),
  );
  if (!bodyGroups.includes(group)) return null;
  const bodyStart = Math.min(...bodyGroups.map((g2) => g2.start));
  const bodyNodes = new Set<number>();
  for (const b of state.allNodes()) {
    if (state.claimed[b]) continue;
    const pc = state.cfg.blocks[b].startPc;
    if (pc >= bodyStart && pc < h1.handlerPc && !state.isHandlerEntryPc(pc)) bodyNodes.add(b);
  }
  {
    const tail = new Set<number>();
    let frontier = new Set<number>();
    for (const b of bodyNodes) {
      for (const sc of state.cfg.blocks[b].succs) {
        if (sc < 0 || bodyNodes.has(sc) || state.claimed[sc]) continue;
        if (state.cfg.blocks[sc].startPc < h1End) continue;
        if (state.isHandlerEntryPc(state.cfg.blocks[sc].startPc)) continue;
        if (state.cfg.blocks[sc].succs.length > 1) continue;
        if (state.sim.stmts[sc].length !== 0) continue;
        frontier.add(sc);
      }
    }
    let guard = 0;
    while (frontier.size && guard++ < 6) {
      const next = new Set<number>();
      for (const x of frontier) {
        if (state.cfg.blocks[x].succs.length > 1) continue;
        if (state.sim.stmts[x].length !== 0) continue;
        tail.add(x);
        for (const sc of state.cfg.blocks[x].succs) {
          if (sc < 0 || bodyNodes.has(sc) || tail.has(sc) || state.claimed[sc]) continue;
          if (state.isHandlerEntryPc(state.cfg.blocks[sc].startPc)) continue;
          if (state.loops.has(sc)) continue;
          if (wctx.breakables.some((br) => br.continueTargets?.has(sc))) continue;
          if (!state.cfg.blocks[x].succs.every((p) => bodyNodes.has(p) || tail.has(p) || p === sc))
            continue;
          next.add(sc);
        }
      }
      frontier = next;
    }
    for (const x of tail) bodyNodes.add(x);
  }
  const firstBody = [...bodyNodes].sort(
    (a, b) => state.cfg.blocks[a].startPc - state.cfg.blocks[b].startPc,
  )[0];
  if (firstBody === undefined) return null;
  for (const g2 of state.rangeGroups) {
    if (g2 === group || g2.done) continue;
    if (
      g2.start >= bodyStart &&
      g2.start < h1.handlerPc &&
      g2.handlers.length > 0 &&
      g2.handlers.every((x) => x.handlerPc !== h1.handlerPc) &&
      !g2.handlers.some((x) => isResourceHandler(state, x.handlerPc))
    ) {
      g2.done = true;
    }
  }

  const spliceAssign = (slot: number): Stmt | undefined => {
    const lists: Stmt[][] = [outerStmts, state.sim.stmts[firstBody]];
    for (const list of lists) {
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        if (s.kind !== 'expr' || s.expr.kind !== 'assign-expr' || s.expr.target.kind !== 'local')
          continue;
        if ((s.expr.target as { slot: number }).slot !== slot) continue;
        list.splice(i, 1);
        return s;
      }
    }
    return undefined;
  };
  const resInitStmt = spliceAssign(resSlot);
  if (!resInitStmt) return null;
  const resExpr = (resInitStmt as { expr: { expr: Expr; target: { name: string; jtype?: JType } } })
    .expr;
  const jtype = resExpr.target.jtype ?? inferInitTypeSimple(resExpr.expr, state.ctx);
  if (!jtype) return null;

  const bodyExits = new Set<number>();
  for (const b of bodyNodes) {
    for (const sc of state.cfg.blocks[b].succs) {
      if (!bodyNodes.has(sc) && !state.claimed[sc]) bodyExits.add(sc);
    }
  }

  for (const g2 of bodyGroups) {
    g2.done = true;
    for (const hh of g2.handlers) {
      g2.consumedHandlers.add(hh.handlerPc);
      state.consumedHandlerPcs.add(hh.handlerPc);
    }
  }
  for (const b of state.allNodes()) {
    if (state.claimed[b]) continue;
    const pc = state.cfg.blocks[b].startPc;
    if (pc >= h1.handlerPc && pc < h1End) state.claimed[b] = true;
  }
  for (const g2 of state.rangeGroups) {
    if (g2.done) continue;
    if (g2.start >= h1.handlerPc && g2.end <= h1End) {
      g2.done = true;
      for (const hh of g2.handlers) {
        g2.consumedHandlers.add(hh.handlerPc);
        state.consumedHandlerPcs.add(hh.handlerPc);
      }
    }
  }

  let body = state.walk(firstBody, bodyNodes, new Set([...bodyExits]), wctx);
  body = stripResourceCloses(body, resSlot);

  const exits = [...bodyExits]
    .filter((b) => !state.claimed[b])
    .sort((a, b) => state.cfg.blocks[a].startPc - state.cfg.blocks[b].startPc);
  const tryStmt: Stmt = {
    kind: 'try',
    body,
    catches: [],
    resources: [{ jtype, name: resExpr.target.name, slot: resSlot, init: resExpr.expr }],
  };
  return { stmt: tryStmt, next: exits[0] ?? -1 };
}
