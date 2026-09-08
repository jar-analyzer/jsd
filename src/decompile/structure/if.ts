import { Expr, Stmt } from '../../ast/ast.js';
import type { WalkCtx } from './types.js';
import { negate, or, and, isNegatedForm, canon } from './conditions.js';
import type { Structurer } from './index.js';

export const ifPart: ThisType<Structurer> &
  Pick<
    Structurer,
    | 'tryBoolValueRegion'
    | 'resolveIf'
    | 'canAbsorb'
    | 'emitIf'
    | 'tryTernaryValue'
    | 'terminatingArm'
  > = {
  tryBoolValueRegion(entry: number): { expr: Expr; slot: number; name: string } | null {
    const memo = new Map<number, Expr | null>();
    let slot: number | null = null;
    let slotName: string | null = null;
    const leafVal = (b: number): Expr | null => {
      const st = this.sim.stmts[b];
      if (st.length !== 1) return null;
      const s0 = st[0];
      if (
        s0.kind !== 'expr' ||
        s0.expr.kind !== 'assign-expr' ||
        s0.expr.target.kind !== 'local' ||
        s0.expr.op
      )
        return null;
      const v = s0.expr.expr;
      if (v.kind !== 'const' || v.ctype !== 'int' || (v.value !== 0 && v.value !== 1)) return null;
      const sl = (s0.expr.target as { slot: number }).slot;
      const name = (s0.expr.target as { name: string }).name;
      if (slot === null) {
        slot = sl;
        slotName = name;
      } else if (slot !== sl) return null;
      return { kind: 'const', ctype: 'boolean', value: v.value === 1 };
    };
    const isTrue = (e: Expr): boolean =>
      e.kind === 'const' && e.ctype === 'boolean' && e.value === true;
    const isFalse = (e: Expr): boolean =>
      e.kind === 'const' && e.ctype === 'boolean' && e.value === false;
    const bv = (b: number, depth: number): Expr | null => {
      if (depth > 24) return null;
      if (memo.has(b)) return memo.get(b)!;
      memo.set(b, null);
      let result: Expr | null = null;
      const leaf = leafVal(b);
      if (leaf !== null) {
        result = leaf;
      } else if (this.sim.stmts[b].length === 0) {
        const t = this.t(b);
        if (t.t === 'if') {
          const J = bv(t.jumpB, depth + 1);
          const F = bv(t.fallB, depth + 1);
          if (J !== null && F !== null) {
            if (isTrue(J) && isFalse(F)) result = t.cond;
            else if (isFalse(J) && isTrue(F)) result = negate(t.cond);
            else if (isTrue(J)) result = or(t.cond, F);
            else if (isTrue(F)) result = or(negate(t.cond), J);
            else if (isFalse(J)) result = and(negate(t.cond), F);
            else if (isFalse(F)) result = and(t.cond, J);
            else result = { kind: 'ternary', cond: t.cond, thenE: J, elseE: F };
          }
        } else if (t.t === 'goto') {
          result = bv(t.target, depth + 1);
        }
      }
      memo.set(b, result);
      return result;
    };
    const expr = bv(entry, 0);
    if (expr === null || slot === null || slotName === null) return null;
    let leaves = 0;
    for (const [, v] of memo) if (v !== null) leaves++;
    if (leaves < 2) return null;
    for (const b of memo.keys()) this.claimed[b] = true;
    return { expr, slot, name: slotName };
  },

  resolveIf(b: number, nodes: Set<number>): { condT: Expr; T: number; condE: Expr; E: number } {
    const term = this.t(b) as { t: 'if'; cond: Expr; jumpB: number; fallB: number };
    let condT = term.cond,
      T = term.jumpB;
    let condE = negate(term.cond),
      E = term.fallB;
    let guard = 0;
    while (guard++ < 64) {
      if (this.canAbsorb(E, b, nodes)) {
        const eterm = this.t(E) as { t: 'if'; cond: Expr; jumpB: number; fallB: number };
        if (eterm.jumpB === T) {
          const nE = eterm.fallB;
          this.absorbed.add(E);
          condT = or(condT, eterm.cond);
          condE = and(condE, negate(eterm.cond));
          E = nE;
          continue;
        }
      }
      if (this.canAbsorb(T, b, nodes)) {
        const tterm = this.t(T) as { t: 'if'; cond: Expr; jumpB: number; fallB: number };
        if (tterm.jumpB === E) {
          const nT = tterm.fallB;
          this.absorbed.add(T);
          condE = or(condE, tterm.cond);
          condT = and(condT, negate(tterm.cond));
          T = nT;
          continue;
        }
      }
      break;
    }
    return { condT, T, condE, E };
  },

  canAbsorb(blk: number, from: number, nodes: Set<number>): boolean {
    if (blk < 0 || !nodes.has(blk) || this.claimed[blk] || this.absorbed.has(blk)) return false;
    const bb = this.cfg.blocks[blk];
    if (bb.preds.length !== 1 || bb.preds[0] !== from) return false;
    if (this.t(blk).t !== 'if') return false;
    if (this.sim.stmts[blk].length !== 0) return false;
    if (this.loops.has(blk)) return false;
    if (this.rangeByStart.has(bb.startPc)) return false;
    return true;
  },

  emitIf(b: number, nodes: Set<number>, follow: Set<number>, wctx: WalkCtx, stmts: Stmt[]): number {
    const res = this.resolveIf(b, nodes);
    const { condT, T, condE, E } = res;
    let followNode = this.pickFollow(b, nodes, follow, [T, E]);
    if (
      followNode === -1 &&
      T >= 0 &&
      E >= 0 &&
      T !== E &&
      wctx.breakables.length === 0 &&
      this.allNodes().has(T) &&
      !this.claimed[T] &&
      !this.absorbed.has(T) &&
      this.reaches(E, T, this.allNodes())
    ) {
      followNode = T;
    }
    if ((followNode === -1 || !nodes.has(followNode)) && wctx.breakables.length > 0) {
      for (let i = wctx.breakables.length - 1; i >= 0; i--) {
        const br = wctx.breakables[i];
        if (br.kind !== 'loop' || !br.updateBlocks) continue;
        for (const ct of br.updateBlocks) {
          if (ct !== b && !this.claimed[ct] && this.reaches(b, ct, nodes)) {
            followNode = ct;
            nodes.add(ct);
            break;
          }
        }
        if (followNode >= 0) break;
      }
    }
    const stop = new Set<number>([...follow, ...(followNode >= 0 ? [followNode] : [])]);
    for (const br of wctx.breakables) {
      if (br.continueTargets) for (const t of br.continueTargets) stop.add(t);
      for (const t of br.exits) stop.add(t);
    }
    const allNodes = this.allNodes();
    const isContinueTarget = (x: number): boolean => {
      for (const br of wctx.breakables) {
        if (br.kind === 'loop' && br.continueTargets?.has(x)) return true;
      }
      return false;
    };
    const terminalish = (x: number): boolean => {
      const t = this.t(x);
      if (t.t === 'return' || t.t === 'throw') return true;
      if (t.t === 'goto') {
        const seen = new Set<number>([x]);
        let y = (t as { target: number }).target;
        let guard = 0;
        while (y >= 0 && !seen.has(y) && guard++ < 4) {
          const ty = this.t(y);
          if (ty.t === 'return' || ty.t === 'throw') return true;
          if (ty.t !== 'goto') return false;
          seen.add(y);
          y = (ty as { target: number }).target;
        }
      }
      return false;
    };
    const isWorkThenBreak = (x: number): boolean => {
      for (const br of wctx.breakables) {
        if (br.exits.has(x) && br.naturalExit !== x) return true;
      }
      return false;
    };
    const isPendingRangeStart = (x: number): boolean => {
      const gs = this.rangeByStart.get(this.cfg.blocks[x]?.startPc ?? -1);
      return (
        !!gs &&
        gs.some(
          (g) =>
            !g.done &&
            g.handlers.some(
              (h) =>
                !this.consumedHandlerPcs.has(h.handlerPc) || this.syncHandlers.has(h.handlerPc),
            ),
        )
      );
    };
    const walkable = (x: number): boolean =>
      x >= 0 &&
      allNodes.has(x) &&
      !this.claimed[x] &&
      !this.absorbed.has(x) &&
      x !== followNode &&
      !isContinueTarget(x) &&
      (!stop.has(x) || (!isPendingRangeStart(x) && (terminalish(x) || isWorkThenBreak(x))));

    let thenS: Stmt[] | undefined;
    let elseS: Stmt[] | undefined;
    if (walkable(E)) {
      const eSet = this.dfsCollect(E, allNodes, new Set([...stop, T]), this.claimedSet());
      elseS = this.walk(E, eSet, new Set([...stop]), wctx);
    } else if (E !== followNode) {
      elseS = this.terminatingArm(E, wctx);
    }
    if (walkable(T)) {
      const tSet = this.dfsCollect(T, allNodes, new Set([...stop, E]), this.claimedSet());
      thenS = this.walk(T, tSet, new Set([...stop]), wctx);
    } else if (T !== followNode) {
      thenS = this.terminatingArm(T, wctx);
    }

    if (elseS && elseS.length) {
      if (thenS && thenS.length) {
        if (isNegatedForm(condE)) stmts.push({ kind: 'if', cond: canon(condT), thenS, elseS });
        else stmts.push({ kind: 'if', cond: canon(condE), thenS: elseS, elseS: thenS });
      } else {
        stmts.push({ kind: 'if', cond: canon(condE), thenS: elseS });
      }
    } else if (thenS && thenS.length) {
      stmts.push({ kind: 'if', cond: canon(condT), thenS });
    } else if (T >= 0 && E >= 0) {
      const tv = this.tryTernaryValue(b, T, E, condT);
      if (tv) stmts.push(tv);
    }
    return followNode;
  },

  tryTernaryValue(b: number, T: number, E: number, condT: Expr): Stmt | null {
    let slot: number | null = null;
    const leaves = new Map<number, Expr>();
    const build = (blk: number, depth: number): Expr | null => {
      if (depth > 12) return null;
      if (leaves.has(blk)) return leaves.get(blk)!;
      const st = this.sim.stmts[blk];
      if (st.length === 1) {
        const s0 = st[0];
        if (s0.kind !== 'expr' || s0.expr.kind !== 'assign-expr' || s0.expr.target.kind !== 'local')
          return null;
        const tgt = s0.expr.target as { slot: number; name?: string };
        if (!tgt.name || !/^r\d+$/.test(tgt.name)) return null;
        if (slot === null) slot = tgt.slot;
        else if (slot !== tgt.slot) return null;
        const v = s0.expr.expr;
        leaves.set(blk, v);
        return v;
      }
      if (st.length !== 0) return null;
      const term = this.t(blk);
      if (term.t === 'if') {
        const ifT = term as { t: 'if'; cond: Expr; jumpB: number; fallB: number };
        const jv = build(ifT.jumpB, depth + 1);
        const fv = build(ifT.fallB, depth + 1);
        if (jv === null || fv === null) return null;
        const v: Expr = { kind: 'ternary', cond: ifT.cond, thenE: jv, elseE: fv };
        leaves.set(blk, v);
        return v;
      }
      if (term.t === 'goto') return build((term as { target: number }).target, depth + 1);
      return null;
    };
    const tv = build(T, 0);
    const ev = build(E, 0);
    if (tv === null || ev === null || slot === null) return null;
    const name = (
      (this.sim.stmts[T].length ? this.sim.stmts[T][0] : this.sim.stmts[E][0]) as {
        expr?: { target?: { name?: string } };
      }
    )?.expr?.target?.name;
    if (!name) return null;
    for (const blk of leaves.keys()) this.claimed[blk] = true;
    this.claimed[b] = true;
    return {
      kind: 'expr',
      expr: {
        kind: 'assign-expr',
        target: { kind: 'local', slot, name },
        expr: { kind: 'ternary', cond: condT, thenE: tv, elseE: ev },
      },
    };
  },

  terminatingArm(target: number, wctx: WalkCtx): Stmt[] | undefined {
    if (target < 0) return undefined;
    let t = target;
    const chain: number[] = [];
    let guard = 0;
    while (guard++ < 8) {
      const blk = this.cfg.blocks[t];
      if (blk && blk.instrs.length === 1 && blk.instrs[0].op === 0xa7 && !this.claimed[t]) {
        chain.push(t);
        const nt = blk.succs[0];
        if (nt === undefined || nt === t) return undefined;
        t = nt;
        continue;
      }
      break;
    }
    const emit = (out: Stmt[]): Stmt[] => {
      for (const c of chain) this.claimed[c] = true;
      return out;
    };
    for (let i = wctx.breakables.length - 1; i >= 0; i--) {
      const br = wctx.breakables[i];
      if (br.kind === 'loop' && br.continueTargets?.has(t)) {
        const out: Stmt[] = [];
        if (i === wctx.breakables.length - 1) out.push({ kind: 'continue' });
        else {
          if (!br.label) br.label = `L${++this.usedLabels}`;
          br.stmt.label = br.label;
          out.push({ kind: 'continue', label: br.label });
        }
        return emit(out);
      }
    }
    const bi = this.breakFor(t, wctx);
    if (bi >= 0) {
      const br = wctx.breakables[bi];
      const out: Stmt[] = [];
      if (bi === wctx.breakables.length - 1) out.push({ kind: 'break' });
      else {
        if (!br.label) br.label = `L${++this.usedLabels}`;
        br.stmt.label = br.label;
        out.push({ kind: 'break', label: br.label });
      }
      return emit(out);
    }
    return undefined;
  },
};
