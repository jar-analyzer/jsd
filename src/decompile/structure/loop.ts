import { Expr, Stmt } from '../../ast/ast.js';
import { StructFail } from './types.js';
import type { LoopInfo, WalkCtx, Breakable } from './types.js';
import { negate } from './conditions.js';
import { removeFromTree, dominatesP } from './stmtstrip.js';
import type { Structurer } from './index.js';

function inductionSlot(s: Stmt): number | null {
  if (s.kind !== 'expr') return null;
  const e = s.expr;
  if (e.kind === 'unary' && (e.op === 'x++' || e.op === 'x--') && e.operand.kind === 'local')
    return e.operand.slot;
  if (e.kind === 'assign-expr' && e.target.kind === 'local') {
    const ex = e.expr;
    if (
      ex.kind === 'binary' &&
      ex.op === '+' &&
      ex.left.kind === 'local' &&
      ex.left.slot === (e.target as { slot: number }).slot &&
      ex.right.kind === 'const' &&
      (ex.right.ctype === 'int' || ex.right.ctype === 'long')
    ) {
      return (e.target as { slot: number }).slot;
    }
  }
  return null;
}

function condInvolvesSlot(cond: Expr, slot: number): boolean {
  if (cond.kind !== 'binary' || !['<', '<=', '>', '>=', '!=', '=='].includes(cond.op)) return false;
  let found = false;
  const walk = (e: Expr): void => {
    if (!e || typeof e !== 'object') return;
    if (e.kind === 'local' && e.slot === slot) found = true;
    switch (e.kind) {
      case 'binary':
        walk(e.left);
        walk(e.right);
        break;
      case 'unary':
        walk(e.operand);
        break;
      case 'cast':
        walk(e.expr);
        break;
      default:
        break;
    }
  };
  walk(cond.left);
  walk(cond.right);
  return found;
}

function stmtAssignsSlot(s: Stmt, slot: number): boolean {
  if (s.kind !== 'expr') return false;
  const e = s.expr;
  if (e.kind === 'assign-expr' && e.target.kind === 'local')
    return (e.target as { slot: number }).slot === slot;
  if (
    e.kind === 'unary' &&
    ['x++', 'x--', '++x', '--x'].includes(e.op) &&
    e.operand.kind === 'local'
  )
    return e.operand.slot === slot;
  return false;
}

export const loopPart: ThisType<Structurer> &
  Pick<Structurer, 'handleLoop' | 'makeLoopBreakable' | 'loopAfter' | 'recoverFor'> = {
  handleLoop(
    loop: LoopInfo,
    enterAt: number,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
    stmts: Stmt[],
  ): number {
    const header = loop.header;
    const loopNodes = new Set([...loop.blocks].filter((x) => nodes.has(x)));
    this.structuredLoops.add(header);

    {
      const bodyClosure = new Set<number>();
      const stack: number[] = [];
      for (const b of loopNodes) if (b !== header) stack.push(b);
      while (stack.length) {
        const x = stack.pop()!;
        for (const sc of this.cfg.blocks[x].succs) {
          if (
            sc < 0 ||
            sc === header ||
            loopNodes.has(sc) ||
            bodyClosure.has(sc) ||
            !nodes.has(sc) ||
            this.claimed[sc]
          )
            continue;
          bodyClosure.add(sc);
          stack.push(sc);
        }
      }
      if (bodyClosure.size) {
        const headerSide = new Set<number>();
        const stack2: number[] = [];
        for (const s of this.cfg.blocks[header].succs) {
          if (s < 0 || s === header || loopNodes.has(s) || s === enterAt) continue;
          if (!headerSide.has(s)) {
            headerSide.add(s);
            stack2.push(s);
          }
        }
        while (stack2.length) {
          const x = stack2.pop()!;
          for (const sc of this.cfg.blocks[x].succs) {
            if (sc < 0 || sc === header || headerSide.has(sc) || !nodes.has(sc)) continue;
            headerSide.add(sc);
            stack2.push(sc);
          }
        }
        for (const x of bodyClosure) {
          if (!headerSide.has(x) && dominatesP(this.cfg, header, x)) loopNodes.add(x);
        }
      }
    }

    const exitSet = new Set<number>();
    for (const bl of loopNodes) {
      for (const s of this.cfg.blocks[bl].succs) {
        if (!loopNodes.has(s) && nodes.has(s)) exitSet.add(s);
      }
    }
    let after = -1;
    const ipd = this.cfg.ipdom[header];
    if (ipd >= 0 && nodes.has(ipd) && !loopNodes.has(ipd) && !this.claimed[ipd]) after = ipd;
    else if (exitSet.size === 1) after = [...exitSet][0];
    else if (exitSet.size > 1) after = Math.min(...exitSet);
    const loopExits = new Set<number>([...exitSet, ...follow]);

    const headerTerm = this.t(header);
    const backSrc = loop.backSrcs.find((u) => loopNodes.has(u)) ?? loop.backSrcs[0];

    if (enterAt !== header) {
      const et = this.t(enterAt);
      if (et.t === 'if') {
        const ifT = et as { t: 'if'; cond: Expr; jumpB: number; fallB: number };
        const entersBody = ifT.jumpB === header || this.reaches(ifT.jumpB, header, loopNodes);
        if (entersBody || this.reaches(ifT.fallB, header, loopNodes)) {
          const cond = entersBody ? ifT.cond : negate(ifT.cond);
          const bodyEntry = entersBody ? ifT.jumpB : ifT.fallB;
          this.claimed[enterAt] = true;
          const whileStmt: Stmt = { kind: 'while', cond, body: [] };
          const brk = this.makeLoopBreakable(
            whileStmt,
            loopExits,
            [header, enterAt, backSrc],
            after,
          );
          const wctx2: WalkCtx = {
            implicitEnds: new Set([`${backSrc}->${header}`]),
            breakables: [...wctx.breakables, brk],
          };
          const bodySet = new Set([...loopNodes].filter((x) => x !== enterAt));
          (whileStmt as { body: Stmt[] }).body = this.walk(
            bodyEntry,
            bodySet,
            new Set([...loopExits]),
            wctx2,
          );
          stmts.push(whileStmt);
          this.claimed[header] = true;
          return this.loopAfter(header, ifT, nodes, loopNodes, exitSet, after);
        }
      }
      if (enterAt === backSrc && this.t(backSrc).t === 'goto') {
        const wStmt: Stmt = { kind: 'while', cond: null, body: [] };
        const brk = this.makeLoopBreakable(wStmt, loopExits, [header, backSrc], after);
        const wctx2: WalkCtx = {
          implicitEnds: new Set([`${backSrc}->${header}`]),
          breakables: [...wctx.breakables, brk],
        };
        const bodySet = new Set([...loopNodes].filter((x) => x !== backSrc));
        (wStmt as { body: Stmt[] }).body = this.walk(
          header,
          bodySet,
          new Set([...loopExits]),
          wctx2,
        );
        this.claimed[backSrc] = true;
        this.claimed[header] = true;
        stmts.push(wStmt);
        return after;
      }
      throw new StructFail(`loop entered at non-header B${enterAt}`);
    }

    if (headerTerm.t === 'if' && (headerTerm as { jumpB: number }).jumpB !== header) {
      const ifT = headerTerm as { t: 'if'; cond: Expr; jumpB: number; fallB: number };
      const jumpIn = loopNodes.has(ifT.jumpB);
      const fallIn = loopNodes.has(ifT.fallB);
      if (jumpIn !== fallIn) {
        const bodyEntry = jumpIn ? ifT.jumpB : ifT.fallB;
        const cond = jumpIn ? ifT.cond : negate(ifT.cond);
        const whileStmt: Stmt = { kind: 'while', cond, body: [] };
        const brk = this.makeLoopBreakable(whileStmt, loopExits, [header, backSrc], after);
        const wctx2: WalkCtx = {
          implicitEnds: new Set([`${backSrc}->${header}`]),
          breakables: [...wctx.breakables, brk],
        };
        const bodySet = new Set([...loopNodes].filter((x) => x !== header));
        const body = this.walk(bodyEntry, bodySet, new Set([...loopExits]), wctx2);
        this.claimed[header] = true;
        const rec = this.recoverFor(header, backSrc, body, cond, stmts, wctx2);
        if (rec) {
          if ((whileStmt as { label?: string }).label) {
            (rec.stmt as { label?: string }).label = (whileStmt as { label?: string }).label;
          }
          brk.stmt = rec.stmt as { label?: string };
          stmts.push(...rec.preStmts);
          stmts.push(rec.stmt);
        } else {
          (whileStmt as { body: Stmt[] }).body = body;
          stmts.push(whileStmt);
        }
        this.claimed[backSrc] = true;
        return this.loopAfter(header, ifT, nodes, loopNodes, exitSet, after);
      }
    }

    const condBlock = backSrc;
    const condTerm = this.t(condBlock);
    if (condTerm.t === 'if') {
      const cT = condTerm as { t: 'if'; cond: Expr; jumpB: number; fallB: number };
      const jumpsBack = cT.jumpB === header || cT.jumpB === backSrc;
      const fallsBack = cT.fallB === header;
      if (jumpsBack || fallsBack) {
        const cond = jumpsBack ? cT.cond : negate(cT.cond);
        const doStmt: Stmt = { kind: 'do-while', cond, body: [] };
        const brk = this.makeLoopBreakable(doStmt, loopExits, [header, condBlock], after);
        const wctx2: WalkCtx = {
          implicitEnds: new Set([`${condBlock}->${header}`]),
          breakables: [...wctx.breakables, brk],
        };
        const selfLoop = condBlock === header;
        const bodySet = new Set([...loopNodes].filter((x) => x !== condBlock || selfLoop));
        const body = selfLoop
          ? [...this.sim.stmts[header]]
          : this.walk(header, bodySet, new Set([...loopExits]), wctx2);
        if (!selfLoop) body.push(...this.sim.stmts[condBlock]);
        this.claimed[condBlock] = true;
        this.claimed[header] = true;
        (doStmt as { body: Stmt[] }).body = body;
        stmts.push(doStmt);
        return this.loopAfter(header, cT, nodes, loopNodes, exitSet, after);
      }
    }
    const wStmt: Stmt = { kind: 'while', cond: null, body: [] };
    const brk = this.makeLoopBreakable(wStmt, loopExits, [header, backSrc], after);
    const wctx2: WalkCtx = {
      implicitEnds: new Set([`${backSrc}->${header}`]),
      breakables: [...wctx.breakables, brk],
    };
    const bodySet = new Set([...loopNodes].filter((x) => x !== backSrc || backSrc === header));
    const body = this.walk(header, bodySet, new Set([...loopExits]), wctx2);
    if (backSrc !== header) body.push(...this.sim.stmts[backSrc]);
    this.claimed[backSrc] = true;
    this.claimed[header] = true;
    (wStmt as { body: Stmt[] }).body = body;
    stmts.push(wStmt);
    return after;
  },

  makeLoopBreakable(
    stmt: Stmt,
    exits: Set<number>,
    continueTargets: number[],
    naturalExit: number,
  ): Breakable {
    const continuations = continueTargets.filter(
      (block, index) =>
        index === 0 ||
        this.t(block).t === 'if' ||
        this.sim.stmts[block].every((stmt) => inductionSlot(stmt) !== null),
    );
    return {
      kind: 'loop',
      exits: new Set([...exits].filter((x) => x >= 0)),
      naturalExit,
      continueTargets: new Set(continuations),
      updateBlocks: new Set(continueTargets.slice(1)),
      stmt: stmt as { label?: string },
    };
  },

  loopAfter(
    header: number,
    ifT: { jumpB: number; fallB: number },
    nodes: Set<number>,
    loopNodes: Set<number>,
    exitSet: Set<number>,
    fallback: number,
  ): number {
    const jumpIn = loopNodes.has(ifT.jumpB);
    const out = jumpIn ? ifT.fallB : ifT.jumpB;
    if (out >= 0 && nodes.has(out) && !this.claimed[out]) return out;
    if (fallback >= 0) return fallback;
    return -1;
  },

  recoverFor(
    header: number,
    backSrc: number,
    body: Stmt[],
    cond: Expr,
    outerStmts: Stmt[],
    _wctx: WalkCtx,
  ): { stmt: Stmt; preStmts: Stmt[] } | null {
    const updStmts = this.sim.stmts[backSrc];
    if (!updStmts.length) return null;
    const last = updStmts[updStmts.length - 1];
    const updSlot = inductionSlot(last);
    if (updSlot === null) return null;
    if (!condInvolvesSlot(cond, updSlot)) return null;
    if (!outerStmts.length) return null;
    const initLast = outerStmts[outerStmts.length - 1];
    if (
      initLast.kind !== 'expr' ||
      initLast.expr.kind !== 'assign-expr' ||
      initLast.expr.target.kind !== 'local'
    )
      return null;
    if ((initLast.expr.target as { slot: number }).slot !== updSlot) return null;
    const initExpr = initLast.expr.expr;
    if (initExpr.kind !== 'const' || (initExpr.ctype !== 'int' && initExpr.ctype !== 'long'))
      return null;
    for (const bl of this.loops.get(header)?.blocks ?? []) {
      for (let i = 0; i < this.sim.stmts[bl].length; i++) {
        const st = this.sim.stmts[bl][i];
        if (bl === backSrc && i === updStmts.length - 1) continue;
        if (stmtAssignsSlot(st, updSlot)) return null;
      }
    }
    outerStmts.pop();
    updStmts.pop();
    const body2 = body.filter((s) => s !== last);
    removeFromTree(body2, last);
    return {
      stmt: { kind: 'for', init: [initLast], cond, update: [last], body: body2 },
      preStmts: [],
    };
  },
};
