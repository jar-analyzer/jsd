import { Expr, Stmt } from '../../ast/ast.js';
import type { JType } from '../../classfile/types.js';
import type { RangeGroup, RecoveredStatement } from './types.js';
import { inferInitTypeSimple, stripResourceCloses } from './stmtstrip.js';
import type { Structurer } from './index.js';

export function detectTwr(
  state: Structurer,
  group: RangeGroup,
  nodes: Set<number>,
  outerStmts: Stmt[],
): RecoveredStatement | null {
  const isSyntheticPrimary = (g: RangeGroup): { resSlot: number } | null => {
    if (g.handlers.length !== 1 || g.handlers[0].catchType !== 'java/lang/Throwable') return null;
    const hb = state.blockOfPc(g.handlers[0].handlerPc);
    if (hb < 0 || state.claimed[hb]) return null;
    const chain = state.handlerChain(hb);
    if (!chain || chain.stmts.length < 2) return null;
    const st = chain.stmts;
    const s0 = st[0];
    if (!(
      s0.kind === 'expr' &&
      s0.expr.kind === 'assign-expr' &&
      s0.expr.target.kind === 'local' &&
      (s0.expr.expr as { text?: string }).text === '@exception'
    ))
      return null;
    const primary = (s0.expr.target as { slot: number }).slot;
    let closeSlot = -1;
    for (const x of st) {
      if (
        x.kind === 'expr' &&
        x.expr.kind === 'invoke' &&
        x.expr.name === 'close' &&
        x.expr.target?.kind === 'local'
      ) {
        if (closeSlot !== -1) return null;
        closeSlot = (x.expr.target as { slot: number }).slot;
      }
    }
    if (closeSlot === -1) return null;
    const endT = state.t(chain.endBlock);
    if (endT.t !== 'throw' || endT.expr.kind !== 'local' || endT.expr.slot !== primary) return null;
    return { resSlot: closeSlot };
  };

  const synth = state.rangeGroups.filter(
    (g2) =>
      !g2.done &&
      g2.start >= group.start &&
      g2.end <= group.end &&
      g2.handlers.length === 1 &&
      g2.handlers[0].catchType === 'java/lang/Throwable' &&
      !!isSyntheticPrimary(g2),
  );
  if (!synth.length) return null;
  synth.sort((a, b) => a.start - b.start);
  const outerSynth = synth[0];
  const innermost = synth[synth.length - 1];
  const resSlots = synth.map((g2) => (isSyntheticPrimary(g2) as { resSlot: number }).resSlot);

  const initBlockStmts: Stmt[] = [];
  const initBlocks: number[] = [];
  for (const b of nodes) {
    const pc = state.cfg.blocks[b].startPc;
    if (pc >= group.start && pc < innermost.start && !state.claimed[b]) {
      initBlocks.push(b);
      initBlockStmts.push(...state.sim.stmts[b]);
    }
  }
  const inits: { jtype: JType; name: string; slot: number; init?: Expr }[] = [];
  for (const slot of resSlots) {
    let found: Stmt | undefined;
    for (const st of initBlockStmts) {
      if (
        st.kind === 'expr' &&
        st.expr.kind === 'assign-expr' &&
        st.expr.target.kind === 'local' &&
        (st.expr.target as { slot: number }).slot === slot
      ) {
        found = st;
      }
    }
    if (!found) {
      for (let i = outerStmts.length - 1; i >= 0; i--) {
        const st = outerStmts[i];
        if (
          st.kind === 'expr' &&
          st.expr.kind === 'assign-expr' &&
          st.expr.target.kind === 'local' &&
          (st.expr.target as { slot: number }).slot === slot
        ) {
          found = st;
          const idx = outerStmts.indexOf(st);
          if (idx >= 0) outerStmts.splice(idx, 1);
          break;
        }
      }
    }
    if (!found) return null;
    const st = found as {
      kind: 'expr';
      expr: {
        kind: 'assign-expr';
        target: { slot: number; name: string; jtype?: JType };
        expr: Expr;
      };
    };
    const t = st.expr.target.jtype ?? inferInitTypeSimple(st.expr.expr, state.ctx);
    if (!t) return null;
    inits.push({ jtype: t, name: st.expr.target.name, slot, init: st.expr.expr });
  }
  for (const b of initBlocks) state.claimed[b] = true;

  for (const g2 of synth) {
    g2.done = true;
    for (const hh of g2.handlers) {
      state.consumedHandlerPcs.add(hh.handlerPc);
      g2.consumedHandlers.add(hh.handlerPc);
      const hbb = state.blockOfPc(hh.handlerPc);
      if (hbb >= 0) {
        state.claimed[hbb] = true;
        for (const x of state.dfsCollect(hbb, nodes, new Set<number>(), state.claimedSet()))
          state.claimed[x] = true;
      }
    }
  }
  for (const g2 of state.rangeGroups) {
    if (g2.done) continue;
    const insideSynth = synth.some((g3) => g2.start >= g3.start - 8 && g2.end <= g3.end + 30);
    if (
      insideSynth &&
      g2.handlers.every((handler) => {
        if (handler.catchType !== 'java/lang/Throwable') return false;
        const block = state.blockOfPc(handler.handlerPc);
        return (
          block >= 0 &&
          state.sim.stmts[block].some(
            (stmt) =>
              stmt.kind === 'expr' &&
              stmt.expr.kind === 'invoke' &&
              stmt.expr.name === 'addSuppressed' &&
              stmt.expr.descriptor === '(Ljava/lang/Throwable;)V',
          )
        );
      })
    ) {
      g2.done = true;
      for (const hh of g2.handlers) {
        state.consumedHandlerPcs.add(hh.handlerPc);
        g2.consumedHandlers.add(hh.handlerPc);
        const hbb = state.blockOfPc(hh.handlerPc);
        if (hbb >= 0) {
          state.claimed[hbb] = true;
          for (const x of state.dfsCollect(hbb, nodes, new Set<number>(), state.claimedSet()))
            state.claimed[x] = true;
        }
      }
    }
  }

  const catches: { type: string | null; body: Stmt[]; varName?: string; varSlot?: number }[] = [];
  let followPc = -1;
  const userGroups: RangeGroup[] = [];
  if (
    group !== outerSynth &&
    group.handlers.some((hh) => hh.catchType !== null && hh.catchType !== 'java/lang/Throwable')
  ) {
    userGroups.push(group);
  } else {
    for (const u of state.rangeGroups) {
      if (u.done || u === group || u.handlers.length < 1) continue;
      if (
        u.start <= group.start &&
        u.end >= group.end &&
        u.handlers.some((hh) => hh.catchType !== null && hh.catchType !== 'java/lang/Throwable')
      ) {
        userGroups.push(u);
      }
    }
  }
  for (const u of userGroups) {
    u.done = true;
    for (const hh of u.handlers) {
      state.consumedHandlerPcs.add(hh.handlerPc);
      u.consumedHandlers.add(hh.handlerPc);
    }
    followPc = u.end;
  }
  const wholeEnd = Math.max(group.end, ...userGroups.map((u) => u.end), outerSynth.end);

  const bodyBlocks = new Set<number>();
  for (const b of nodes) {
    const pc = state.cfg.blocks[b].startPc;
    if (pc >= innermost.start && pc < innermost.end && !state.claimed[b]) bodyBlocks.add(b);
  }
  for (const b of nodes) {
    if (bodyBlocks.has(b) || state.claimed[b]) continue;
    const pc = state.cfg.blocks[b].startPc;
    if (pc >= group.start && pc < wholeEnd) state.claimed[b] = true;
  }
  const bodyExits = new Set<number>();
  for (const b of bodyBlocks) {
    for (const sc of state.cfg.blocks[b].succs) {
      if (!bodyBlocks.has(sc)) bodyExits.add(sc);
    }
  }

  let body = state.walk(state.blockOfPc(innermost.start), bodyBlocks, bodyExits, {
    implicitEnds: new Set(),
    breakables: [],
  });

  for (const slot of resSlots) {
    const ranges = synth.filter((_, index) => resSlots[index] === slot);
    body = stripResourceCloses(body, slot, ranges);
  }

  const cont = new Set<number>();
  for (const b of nodes) {
    if (!state.claimed[b]) continue;
    for (const sc of state.cfg.blocks[b].succs) {
      if (!state.claimed[sc] && nodes.has(sc)) {
        if (state.cfg.blocks[sc].startPc >= group.start && state.cfg.blocks[sc].startPc < wholeEnd)
          continue;
        cont.add(sc);
      }
    }
  }
  const catchExits = new Set<number>([...cont]);
  for (const u of userGroups) {
    for (const hh of u.handlers) {
      const hbb = state.blockOfPc(hh.handlerPc);
      if (hbb < 0 || state.claimed[hbb]) continue;
      const hst = state.sim.stmts[hbb];
      let varName: string | undefined;
      let varSlot: number | undefined;
      if (
        hst.length &&
        hst[0].kind === 'expr' &&
        hst[0].expr.kind === 'assign-expr' &&
        hst[0].expr.target.kind === 'local' &&
        (hst[0].expr.expr as { text?: string }).text === '@exception'
      ) {
        varSlot = (hst[0].expr.target as { slot: number }).slot;
        varName = (hst[0].expr.target as { name: string }).name;
        hst.shift();
      }
      const region = state.handlerOwned(hbb, nodes);
      cont.delete(hbb);
      for (const block of region) {
        for (const next of state.cfg.blocks[block].succs) {
          if (!region.has(next) && !state.claimed[next] && nodes.has(next)) {
            catchExits.add(next);
            cont.add(next);
          }
        }
      }
      const cbody = state.walk(hbb, region, catchExits, {
        implicitEnds: new Set(),
        breakables: [],
      });
      catches.push({ type: hh.catchType, body: cbody, varName, varSlot });
    }
  }

  let followBlock = followPc >= 0 ? state.blockOfPc(followPc) : -1;
  if (cont.size > 0 && (followBlock < 0 || state.claimed[followBlock])) {
    followBlock = [...cont].sort(
      (a, b) => state.cfg.blocks[a].startPc - state.cfg.blocks[b].startPc,
    )[0];
    followPc = state.cfg.blocks[followBlock].startPc;
  }
  const stmt: Stmt = { kind: 'try', body, catches, resources: inits };
  return { stmt, next: followPc < 0 ? -1 : state.blockOfPc(followPc) };
}
