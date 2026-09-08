import { attemptRecognition } from './recognition.js';
import { Expr, Stmt } from '../../ast/ast.js';
import type { RangeGroup } from './types.js';
import { negate } from './conditions.js';
import type { Structurer } from './index.js';

export const syncPart: ThisType<Structurer> &
  Pick<Structurer, 'detectSync' | 'detectFinally' | 'walkFinallyRegion'> = {
  detectSync(group: RangeGroup, outerStmts?: Stmt[]): boolean {
    if (group.isSync || group.finallyBody) return group.isSync;
    if (!group.handlers.length) return false;
    let lockSlot = -1;
    let viaSharedSync = false;
    for (const h of group.handlers) {
      const sharedLock = this.syncHandlers.get(h.handlerPc);
      if (sharedLock !== undefined) {
        lockSlot = sharedLock;
        viaSharedSync = true;
        continue;
      }
      if (h.catchType !== null) continue;
      const hb = this.blockOfPc(h.handlerPc);
      if (hb < 0 || this.claimed[hb]) return false;
      const chain = this.handlerChain(hb);
      if (!chain) return false;
      const st = chain.stmts;
      const s0 = st[0];
      if (!(
        s0.kind === 'expr' &&
        s0.expr.kind === 'assign-expr' &&
        s0.expr.target.kind === 'local' &&
        (s0.expr.expr as { text?: string }).text === '@exception'
      ))
        return false;
      const exSlot = (s0.expr.target as { slot: number }).slot;
      let mon: Expr | null = null;
      for (const x of st) {
        if (x.kind === 'expr' && x.expr.kind === 'monitor') {
          if (mon) return false;
          mon = (x.expr as { expr: Expr }).expr;
        }
      }
      if (!mon || mon.kind !== 'local') return false;
      if (lockSlot === -1) lockSlot = mon.slot;
      else if (lockSlot !== mon.slot) return false;
      const endTerm = this.t(chain.endBlock);
      if (endTerm.t !== 'throw' || endTerm.expr.kind !== 'local' || endTerm.expr.slot !== exSlot)
        return false;
    }
    const eb = this.blockOfPc(group.start);
    if (eb < 0) return false;
    let st: Stmt[] = this.sim.stmts[eb];
    const fromOuter = outerStmts !== undefined && outerStmts.length >= 2;
    if (fromOuter) st = outerStmts;
    if (
      !fromOuter ||
      !(
        st.length >= 2 &&
        st[st.length - 2].kind === 'expr' &&
        (st[st.length - 2] as { expr: { kind?: string } }).expr?.kind === 'assign-expr' &&
        st[st.length - 1].kind === 'expr' &&
        (st[st.length - 1] as { expr: { kind?: string } }).expr?.kind === 'monitor'
      )
    ) {
      const pm = this.pendingMonitors.find((x) => !x.used);
      if (!pm) return false;
      const arr = pm.arr;
      const a1 = arr[arr.length - 1];
      if (!a1 || a1.kind !== 'expr' || (a1.expr as { kind?: string }).kind !== 'monitor')
        return false;
      const monitorExpr0 = (a1.expr as unknown as { expr: Expr }).expr;
      group.isSync = true;
      group.monitorSlot = lockSlot;
      this.syncLockSlots.add(lockSlot);
      group.monitorExpr = monitorExpr0;
      pm.used = true;
      arr.splice(arr.length - 1, 1);
      for (const h of group.handlers) {
        if (h.catchType !== null) continue;
        group.consumedHandlers.add(h.handlerPc);
        this.consumedHandlerPcs.add(h.handlerPc);
      }
      for (const g2 of this.rangeGroups) {
        for (const h2 of g2.handlers) {
          if (this.consumedHandlerPcs.has(h2.handlerPc)) g2.consumedHandlers.add(h2.handlerPc);
        }
      }
      this.mergeSequentialRanges(group);
      for (const h of group.handlers) {
        if (group.consumedHandlers.has(h.handlerPc)) this.syncHandlers.set(h.handlerPc, lockSlot);
      }
      return true;
    }
    const own = this.sim.stmts[eb];
    const lastOuter = st[st.length - 1];
    const splitPair =
      fromOuter &&
      st.length >= 1 &&
      own.length === 1 &&
      lastOuter.kind === 'expr' &&
      (lastOuter.expr as { kind?: string; target?: { slot?: number } }).kind === 'assign-expr' &&
      (lastOuter.expr as unknown as { target?: { slot?: number } }).target?.slot === lockSlot &&
      own[0].kind === 'expr' &&
      (own[0].expr as { kind?: string }).kind === 'monitor';
    if (
      splitPair ||
      (st.length >= 2 &&
        st[st.length - 2].kind === 'expr' &&
        (st[st.length - 2] as { expr: { kind?: string } }).expr?.kind === 'assign-expr' &&
        st[st.length - 1].kind === 'expr' &&
        (st[st.length - 1] as { expr: { kind?: string } }).expr?.kind === 'monitor')
    ) {
      const assignStmt = st[st.length - (splitPair ? 1 : 2)] as {
        kind: 'expr';
        expr: { kind: 'assign-expr'; target: { kind: string; slot?: number } };
      };
      const slot = assignStmt.expr.target.slot as number;
      if (slot === lockSlot) {
        group.isSync = true;
        group.monitorSlot = lockSlot;
        this.syncLockSlots.add(lockSlot);
        const monStmt = (splitPair ? own[0] : st[st.length - 1]) as {
          kind: 'expr';
          expr: { kind: 'monitor'; expr: Expr };
        };
        group.monitorExpr = monStmt.expr.expr;
        if (splitPair) this.sim.stmts[eb] = [];
        void viaSharedSync;
        for (const h of group.handlers) {
          if (h.catchType !== null) continue;
          group.consumedHandlers.add(h.handlerPc);
          this.consumedHandlerPcs.add(h.handlerPc);
        }
        for (const g2 of this.rangeGroups) {
          for (const h2 of g2.handlers) {
            if (this.consumedHandlerPcs.has(h2.handlerPc)) g2.consumedHandlers.add(h2.handlerPc);
          }
        }
        if (fromOuter) {
          outerStmts!.pop();
          if (!splitPair) outerStmts!.pop();
        } else {
          this.sim.stmts[eb] = st.slice(0, st.length - 2);
        }
        for (const h of group.handlers) this.syncHandlers.set(h.handlerPc, lockSlot);
        this.mergeSequentialRanges(group);
        return true;
      }
    }
    return false;
  },

  detectFinally(group: RangeGroup): boolean {
    if (group.finallyBody || group.isSync) return !!group.finallyBody;
    for (let i = group.handlers.length - 1; i >= 0; i--) {
      const h = group.handlers[i];
      if (h.catchType !== null) continue;
      const hb = this.blockOfPc(h.handlerPc);
      if (hb < 0 || this.claimed[hb]) continue;
      const st0 = this.sim.stmts[hb];
      if (!st0.length) continue;
      const s0 = st0[0];
      if (!(
        s0.kind === 'expr' &&
        s0.expr.kind === 'assign-expr' &&
        s0.expr.target.kind === 'local' &&
        (s0.expr.expr as { text?: string }).text === '@exception'
      ))
        continue;
      const exSlot = (s0.expr.target as { slot: number }).slot;
      let mid: Stmt[] | null = null;
      const chain = this.handlerChain(hb);
      if (chain) {
        const endTerm = this.t(chain.endBlock);
        if (
          endTerm.t === 'throw' &&
          endTerm.expr.kind === 'local' &&
          (endTerm.expr as { slot: number }).slot === exSlot
        ) {
          mid = chain.stmts.slice(1);
        }
      }
      if (mid === null)
        mid = attemptRecognition(this, [group], () => {
          const body = this.walkFinallyRegion(hb, exSlot);
          return body?.length && !body.some((x) => x.kind === 'expr' && x.expr.kind === 'monitor')
            ? body
            : null;
        });
      if (mid === null || mid.length === 0) continue;
      if (mid.some((x) => x.kind === 'expr' && x.expr.kind === 'monitor')) continue;
      group.finallyBody = mid;
      group.consumedHandlers.add(h.handlerPc);
      this.consumedHandlerPcs.add(h.handlerPc);
      for (const g2 of this.rangeGroups) {
        for (const h2 of g2.handlers) {
          if (h2.handlerPc === h.handlerPc) g2.consumedHandlers.add(h.handlerPc);
        }
      }
      this.mergeSequentialRanges(group);
      return true;
    }
    return false;
  },

  walkFinallyRegion(hb: number, exSlot: number): Stmt[] | null {
    const region = this.handlerOwned(hb, this.allNodes());
    if (region.size < 2) return null;
    for (const b of region) {
      for (const sc of this.cfg.blocks[b].succs) {
        if (!region.has(sc)) return null;
      }
      const t = this.t(b);
      if (t.t === 'throw') {
        if (t.expr.kind !== 'local' || t.expr.slot !== exSlot) return null;
      } else if (t.t !== 'if' && t.t !== 'goto' && t.t !== 'none') return null;
    }
    let stmts = this.walk(hb, new Set(region), new Set(), {
      implicitEnds: new Set(),
      breakables: [],
    });
    if (
      stmts.length &&
      stmts[0].kind === 'expr' &&
      (stmts[0].expr as { kind?: string }).kind === 'assign-expr' &&
      ((stmts[0].expr as { target?: { slot?: number } }).target as { slot?: number })?.slot ===
        exSlot
    ) {
      stmts = stmts.slice(1);
    }
    const isRethrow = (s: Stmt): boolean =>
      s.kind === 'throw' &&
      (s.expr as { kind?: string; slot?: number }).kind === 'local' &&
      (s.expr as { slot?: number }).slot === exSlot;
    const clean = (list: Stmt[]): Stmt[] => {
      const out: Stmt[] = [];
      for (const s of list) {
        if (isRethrow(s)) continue;
        switch (s.kind) {
          case 'if': {
            s.thenS = clean(s.thenS);
            if (s.elseS) s.elseS = clean(s.elseS);
            if (s.thenS.length === 0 && s.elseS && s.elseS.length) {
              s.cond = negate(s.cond);
              s.thenS = s.elseS;
              delete s.elseS;
            } else if (s.elseS && s.elseS.length === 0 && s.thenS.length) {
              delete s.elseS;
            } else if (s.thenS.length === 0 && (!s.elseS || s.elseS.length === 0)) {
              continue;
            }
            break;
          }
          case 'while':
          case 'do-while':
            s.body = clean(s.body);
            break;
          case 'for':
            s.body = clean(s.body);
            break;
          case 'foreach':
            s.body = clean(s.body);
            break;
          case 'switch':
            for (const c of s.cases) c.body = clean(c.body);
            break;
          case 'try':
            s.body = clean(s.body);
            for (const c of s.catches) c.body = clean(c.body);
            if (s.finallyS) s.finallyS = clean(s.finallyS);
            break;
          case 'sync':
            s.body = clean(s.body);
            break;
          case 'label': {
            const inner = clean([s.inner]);
            if (!inner.length) continue;
            s.inner = inner[0];
            break;
          }
          default:
            break;
        }
        out.push(s);
      }
      return out;
    };
    return clean(stmts);
  },
};
