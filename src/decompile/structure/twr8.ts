import { Expr, Stmt } from '../../ast/ast.js';
import type { JType } from '../../classfile/types.js';
import type { RangeGroup, WalkCtx, RecoveredStatement } from './types.js';
import { inferInitTypeSimple, stripCloseDiamonds } from './stmtstrip.js';
import type { Structurer } from './index.js';

import { isResourceHandler } from './resource-handler.js';
export function detectTwr8(
  state: Structurer,
  group: RangeGroup,
  nodes: Set<number>,
  outerStmts: Stmt[],
  wctx: WalkCtx,
): RecoveredStatement | null {
  const h1 = group.handlers.find((h) => h.catchType === 'java/lang/Throwable');
  const h2 = group.handlers.find((h) => h.catchType === null);
  if (!h1 || !h2 || h1.handlerPc === h2.handlerPc) return null;
  const hb1 = state.blockOfPc(h1.handlerPc);
  if (hb1 < 0 || state.claimed[hb1]) return null;
  const chain1 = state.handlerChain(hb1);
  if (!chain1 || !chain1.stmts.length) return null;
  const st1 = chain1.stmts;
  const f1 = st1[0];
  if (!(
    f1.kind === 'expr' &&
    f1.expr.kind === 'assign-expr' &&
    f1.expr.target.kind === 'local' &&
    (f1.expr.expr as { text?: string }).text === '@exception'
  ))
    return null;
  const tSlot = (f1.expr.target as { slot: number }).slot;
  const end1 = state.t(chain1.endBlock);
  if (
    end1.t !== 'throw' ||
    end1.expr.kind !== 'local' ||
    (end1.expr as { slot: number }).slot !== tSlot
  )
    return null;
  let pSlot = tSlot;
  for (const x of st1.slice(1)) {
    if (
      x.kind === 'expr' &&
      x.expr.kind === 'assign-expr' &&
      x.expr.target.kind === 'local' &&
      x.expr.expr.kind === 'local' &&
      (x.expr.expr as { slot: number }).slot === tSlot
    ) {
      pSlot = (x.expr.target as { slot: number }).slot;
    } else return null;
  }
  const hb2 = state.blockOfPc(h2.handlerPc);
  if (hb2 < 0 || state.claimed[hb2] || hb2 === hb1) return null;
  const region2 = state.dfsCollect(hb2, state.allNodes(), new Set<number>(), state.claimedSet());
  if (!region2.has(hb2) || region2.has(hb1)) return null;
  for (const b of region2) {
    for (const sc of state.cfg.blocks[b].succs) if (!region2.has(sc)) return null;
  }
  const st2 = state.sim.stmts[hb2];
  if (!st2.length) return null;
  const f2 = st2[0];
  if (!(
    f2.kind === 'expr' &&
    f2.expr.kind === 'assign-expr' &&
    f2.expr.target.kind === 'local' &&
    (f2.expr.expr as { text?: string }).text === '@exception'
  ))
    return null;
  const sSlot = (f2.expr.target as { slot: number }).slot;
  let sawThrow = false;
  for (const b of region2) {
    const t = state.t(b);
    if (t.t === 'throw') {
      if (t.expr.kind !== 'local' || (t.expr as { slot: number }).slot !== sSlot) return null;
      sawThrow = true;
    } else if (t.t !== 'if' && t.t !== 'goto' && t.t !== 'none') return null;
  }
  if (!sawThrow) return null;
  const resSlots = new Set<number>();
  let suppressed = false;
  let h2End = 0;
  for (const b of region2) h2End = Math.max(h2End, state.cfg.blocks[b].endPc);
  for (const b of state.allNodes()) {
    const pc = state.cfg.blocks[b].startPc;
    if (pc < h2.handlerPc || pc >= h2End) continue;
    for (const s of state.sim.stmts[b]) {
      if (s.kind !== 'expr' || s.expr.kind !== 'invoke') continue;
      if (s.expr.name === 'close' && s.expr.target?.kind === 'local') {
        resSlots.add((s.expr.target as { slot: number }).slot);
      }
      if (
        s.expr.name === 'addSuppressed' &&
        s.expr.target?.kind === 'local' &&
        (s.expr.target as { slot: number }).slot === pSlot
      ) {
        suppressed = true;
      }
    }
  }
  if (resSlots.size !== 1 || !suppressed) return null;
  const resSlot = [...resSlots][0];

  const mine = new Set([h1.handlerPc, h2.handlerPc]);
  const bodyGroups = state.rangeGroups.filter(
    (g2) =>
      (g2 === group || !g2.done) &&
      g2.handlers.length > 0 &&
      g2.handlers.some((x) => x.handlerPc === h1.handlerPc) &&
      g2.handlers.every((x) => mine.has(x.handlerPc)),
  );
  if (!bodyGroups.includes(group)) return null;
  const bodyStart = Math.min(...bodyGroups.map((g2) => g2.start));
  const bodyNodes = new Set<number>();
  for (const b of state.allNodes()) {
    if (state.claimed[b]) continue;
    const pc = state.cfg.blocks[b].startPc;
    if (pc >= bodyStart && pc < h1.handlerPc && !state.isHandlerEntryPc(pc)) bodyNodes.add(b);
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
      g2.handlers.every((x) => x.handlerPc >= h1.handlerPc) &&
      !g2.handlers.some((x) => isResourceHandler(state, x.handlerPc))
    ) {
      g2.done = true;
    }
  }

  const spliceAssign = (slot: number, pred?: (e: Expr) => boolean): Stmt | undefined => {
    const lists: Stmt[][] = [outerStmts, state.sim.stmts[firstBody]];
    for (const list of lists) {
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        if (s.kind !== 'expr' || s.expr.kind !== 'assign-expr' || s.expr.target.kind !== 'local')
          continue;
        if ((s.expr.target as { slot: number }).slot !== slot) continue;
        if (pred && !pred(s.expr.expr)) continue;
        list.splice(i, 1);
        return s;
      }
    }
    return undefined;
  };
  const nullInit = spliceAssign(
    pSlot,
    (e) => e.kind === 'const' && (e as { ctype?: string }).ctype === 'null',
  );
  if (!nullInit) return null;
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
  let maxEnd = 0;
  for (const b of region2) maxEnd = Math.max(maxEnd, state.cfg.blocks[b].endPc);
  for (const b of state.allNodes()) {
    if (state.claimed[b]) continue;
    const pc = state.cfg.blocks[b].startPc;
    if (pc >= h1.handlerPc && pc < maxEnd) state.claimed[b] = true;
  }
  for (const g2 of state.rangeGroups) {
    if (g2.done) continue;
    if (
      g2.start >= h1.handlerPc &&
      g2.end <= maxEnd &&
      g2.handlers.every((h) => h.handlerPc >= h1.handlerPc && h.handlerPc < maxEnd)
    ) {
      g2.done = true;
      for (const hh of g2.handlers) {
        g2.consumedHandlers.add(hh.handlerPc);
        state.consumedHandlerPcs.add(hh.handlerPc);
      }
    }
  }

  let body = state.walk(firstBody, bodyNodes, new Set([...bodyExits]), wctx);
  body = stripCloseDiamonds(body, resSlot, pSlot);

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
