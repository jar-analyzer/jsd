import type { Structurer } from './index.js';

export function isResourceHandler(state: Structurer, handlerPc: number): boolean {
  const hb = state.blockOfPc(handlerPc);
  if (hb < 0 || state.claimed[hb]) return false;
  const region = state.handlerOwned(hb, state.allNodes());
  if (!region.has(hb) || region.size < 2) return false;
  const st1 = state.sim.stmts[hb];
  if (!st1.length) return false;
  const f1 = st1[0];
  if (!(
    f1.kind === 'expr' &&
    f1.expr.kind === 'assign-expr' &&
    f1.expr.target.kind === 'local' &&
    (f1.expr.expr as { text?: string }).text === '@exception'
  ))
    return false;
  const tSlot = (f1.expr.target as { slot: number }).slot;
  let sawThrow = false;
  let hEnd = 0;
  for (const b of region) {
    hEnd = Math.max(hEnd, state.cfg.blocks[b].endPc);
    for (const sc of state.cfg.blocks[b].succs) if (!region.has(sc)) return false;
    const t = state.t(b);
    if (t.t === 'throw') {
      if (t.expr.kind !== 'local' || (t.expr as { slot: number }).slot !== tSlot) return false;
      sawThrow = true;
    } else if (t.t !== 'if' && t.t !== 'goto' && t.t !== 'none') return false;
  }
  if (!sawThrow) return false;
  let closed = false;
  let suppressed = false;
  for (const b of state.allNodes()) {
    const pc = state.cfg.blocks[b].startPc;
    if (pc < handlerPc || pc >= hEnd) continue;
    for (const s of state.sim.stmts[b]) {
      if (s.kind !== 'expr' || s.expr.kind !== 'invoke') continue;
      if (s.expr.name === 'close' && s.expr.target?.kind === 'local') closed = true;
      if (
        s.expr.name === 'addSuppressed' &&
        s.expr.target?.kind === 'local' &&
        (s.expr.target as { slot: number }).slot === tSlot
      )
        suppressed = true;
    }
  }
  return closed && suppressed;
}
