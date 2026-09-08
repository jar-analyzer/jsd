import { Expr, Stmt } from '../../ast/ast.js';
import type { JType } from '../../classfile/types.js';
import { parseMethodDescriptor } from '../../classfile/types.js';
import type { CFG } from '../../bytecode/cfg.js';
import type { Ctx } from '../context.js';
import { anonSupertype } from '../java/types.js';
import { negate } from './conditions.js';

export function inferInitTypeSimple(e: Expr, ctx?: Ctx): JType | null {
  if (e.kind === 'new') return anonSupertype(e.owner, ctx) ?? { kind: 'class', name: e.owner };
  if (e.kind === 'invoke') {
    try {
      const ret = parseMethodDescriptor(e.descriptor).ret;
      return ret.kind === 'prim' && ret.name === 'void' ? null : ret;
    } catch {
      return null;
    }
  }
  if (e.kind === 'cast') return e.jtype;
  if (e.kind === 'local' || e.kind === 'field-get') return (e as { jtype?: JType }).jtype ?? null;
  return null;
}

export function removeFromTree(list: Stmt[], target: Stmt): void {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] === target) {
      list.splice(i, 1);
      continue;
    }
    const st = list[i];
    switch (st.kind) {
      case 'if':
        removeFromTree(st.thenS, target);
        if (st.elseS) removeFromTree(st.elseS, target);
        break;
      case 'while':
      case 'do-while':
        removeFromTree(st.body, target);
        break;
      case 'for':
        removeFromTree(st.init, target);
        removeFromTree(st.update, target);
        removeFromTree(st.body, target);
        break;
      case 'foreach':
        removeFromTree(st.body, target);
        break;
      case 'switch':
        for (const c of st.cases) removeFromTree(c.body, target);
        break;
      case 'try':
        removeFromTree(st.body, target);
        for (const c of st.catches) removeFromTree(c.body, target);
        if (st.finallyS) removeFromTree(st.finallyS, target);
        break;
      case 'sync':
        removeFromTree(st.body, target);
        break;
      case 'label':
        removeFromTree([st.inner], target);
        break;
      default:
        break;
    }
  }
}

export function dominatesP(cfg: CFG, a: number, b: number): boolean {
  let x = b;
  const seen = new Set<number>();
  while (x !== -1 && !seen.has(x)) {
    if (x === a) return true;
    seen.add(x);
    x = cfg.idom[x];
  }
  return false;
}

function isMonitorExit(s: Stmt, slot?: number): boolean {
  if (s.kind !== 'expr' || s.expr.kind !== 'monitor') return false;
  const m = (s.expr as { expr: Expr }).expr;
  if (m.kind !== 'local') return false;
  return slot === undefined || m.slot === slot;
}

export function stripResourceCloses(body: Stmt[], resSlot: number): Stmt[] {
  const isClose = (s: Stmt): boolean =>
    s.kind === 'expr' &&
    s.expr.kind === 'invoke' &&
    s.expr.name === 'close' &&
    s.expr.target?.kind === 'local' &&
    (s.expr.target as { slot: number }).slot === resSlot;
  const mentionsResNull = (e: Expr): boolean => {
    if (!e || typeof e !== 'object') return false;
    if (e.kind === 'binary' && (e.op === '==' || e.op === '!=')) {
      const l = e.left as { kind?: string; slot?: number };
      const r = e.right as { kind?: string; slot?: number };
      return (
        (l.kind === 'local' && l.slot === resSlot) || (r.kind === 'local' && r.slot === resSlot)
      );
    }
    return false;
  };
  const isGuardedClose = (s: Stmt): boolean =>
    s.kind === 'if' &&
    !s.elseS &&
    s.thenS.length === 1 &&
    isClose(s.thenS[0]) &&
    mentionsResNull(s.cond);
  const strip = (list: Stmt[]): Stmt[] => {
    const out: Stmt[] = [];
    for (const s of list) {
      if (isClose(s)) continue;
      if (isGuardedClose(s)) continue;
      switch (s.kind) {
        case 'if':
          s.thenS = strip(s.thenS);
          if (s.elseS) s.elseS = strip(s.elseS);
          if (!s.thenS.length && s.elseS && s.elseS.length) {
            s.cond = negate(s.cond);
            s.thenS = s.elseS;
            delete s.elseS;
          } else if (s.elseS && !s.elseS.length) {
            delete s.elseS;
          } else if (!s.thenS.length && (!s.elseS || !s.elseS.length)) {
            continue;
          }
          break;
        case 'while':
        case 'do-while':
          s.body = strip(s.body);
          break;
        case 'for':
          s.body = strip(s.body);
          break;
        case 'foreach':
          s.body = strip(s.body);
          break;
        case 'switch':
          for (const c of s.cases) c.body = strip(c.body);
          break;
        case 'try':
          s.body = strip(s.body);
          for (const c of s.catches) c.body = strip(c.body);
          if (s.finallyS) s.finallyS = strip(s.finallyS);
          break;
        case 'sync':
          s.body = strip(s.body);
          break;
        case 'label': {
          const inner = strip([s.inner]);
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
  return strip(body);
}

export function stripCloseDiamonds(body: Stmt[], resSlot: number, pSlot: number): Stmt[] {
  const isClose = (s: Stmt): boolean =>
    s.kind === 'expr' &&
    s.expr.kind === 'invoke' &&
    s.expr.name === 'close' &&
    s.expr.target?.kind === 'local' &&
    (s.expr.target as { slot: number }).slot === resSlot;
  const isEdge = (s: Stmt): boolean => s.kind === 'continue' || s.kind === 'break';
  const isCloseSeq = (list: Stmt[]): boolean =>
    (list.length === 1 && isClose(list[0])) ||
    (list.length === 2 && isClose(list[0]) && isEdge(list[1]));
  const isSuppressedTry = (s: Stmt): boolean => {
    if (s.kind !== 'try' || !s.catches.length) return false;
    if (!isCloseSeq(s.body)) return false;
    return s.catches.every(
      (c) =>
        (c.body.length === 1 || (c.body.length === 2 && isEdge(c.body[1]))) &&
        c.body[0].kind === 'expr' &&
        c.body[0].expr.kind === 'invoke' &&
        c.body[0].expr.name === 'addSuppressed' &&
        c.body[0].expr.target?.kind === 'local' &&
        (c.body[0].expr.target as { slot: number }).slot === pSlot,
    );
  };
  const armEdge = (list: Stmt[]): Stmt | null =>
    list.length === 2 && isEdge(list[1]) ? list[1] : null;
  const isDiamondCore = (s: Stmt): boolean => {
    if (s.kind !== 'if' || !s.elseS) return false;
    const plainArm = (list: Stmt[]): boolean => isCloseSeq(list);
    const tryArm = (list: Stmt[]): boolean => list.length === 1 && isSuppressedTry(list[0]);
    return (plainArm(s.thenS) && tryArm(s.elseS)) || (tryArm(s.thenS) && plainArm(s.elseS));
  };
  const isDiamond = (s: Stmt): boolean => {
    if (isDiamondCore(s)) return true;
    if (s.kind === 'if' && !s.elseS && s.thenS.length === 1) return isDiamondCore(s.thenS[0]);
    return false;
  };
  const diamondEdge = (s: Stmt): Stmt | null => {
    const core = isDiamondCore(s)
      ? s
      : s.kind === 'if' && s.elseS === undefined && s.thenS.length === 1
        ? s.thenS[0]
        : null;
    if (!core || core.kind !== 'if' || !core.elseS) return null;
    return (
      armEdge(core.thenS) ??
      armEdge(core.elseS) ??
      (core.elseS.length === 1 && core.elseS[0].kind === 'try'
        ? core.elseS[0].body.length === 2
          ? core.elseS[0].body[1]
          : core.elseS[0].catches[0]?.body.length === 2
            ? core.elseS[0].catches[0].body[1]
            : null
        : null)
    );
  };
  const strip = (list: Stmt[]): Stmt[] => {
    const out: Stmt[] = [];
    for (const s of list) {
      if (isDiamond(s)) {
        const e = diamondEdge(s);
        if (e) out.push(e);
        continue;
      }
      switch (s.kind) {
        case 'if':
          s.thenS = strip(s.thenS);
          if (s.elseS) s.elseS = strip(s.elseS);
          if (!s.thenS.length && s.elseS && s.elseS.length) {
            s.cond = negate(s.cond);
            s.thenS = s.elseS;
            delete s.elseS;
          } else if (s.elseS && !s.elseS.length) {
            delete s.elseS;
          } else if (!s.thenS.length && (!s.elseS || !s.elseS.length)) {
            continue;
          }
          break;
        case 'while':
        case 'do-while':
          s.body = strip(s.body);
          break;
        case 'for':
          s.body = strip(s.body);
          break;
        case 'foreach':
          s.body = strip(s.body);
          break;
        case 'switch':
          for (const c of s.cases) c.body = strip(c.body);
          break;
        case 'try':
          s.body = strip(s.body);
          for (const c of s.catches) c.body = strip(c.body);
          if (s.finallyS) s.finallyS = strip(s.finallyS);
          break;
        case 'sync':
          s.body = strip(s.body);
          break;
        case 'label': {
          const inner = strip([s.inner]);
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
  return strip(body);
}

export function stripMonitorExits(body: Stmt[], slot: number): Stmt[] {
  const strip = (list: Stmt[]): Stmt[] => {
    const out: Stmt[] = [];
    for (const st of list) {
      if (isMonitorExit(st, slot)) continue;
      switch (st.kind) {
        case 'if':
          st.thenS = strip(st.thenS);
          if (st.elseS) st.elseS = strip(st.elseS);
          break;
        case 'while':
        case 'do-while':
          st.body = strip(st.body);
          break;
        case 'for':
          st.body = strip(st.body);
          break;
        case 'foreach':
          st.body = strip(st.body);
          break;
        case 'switch':
          for (const c of st.cases) c.body = strip(c.body);
          break;
        case 'try':
          st.body = strip(st.body);
          for (const c of st.catches) c.body = strip(c.body);
          if (st.finallyS) st.finallyS = strip(st.finallyS);
          break;
        case 'sync':
          break;
        case 'label': {
          const inner = strip([st.inner]);
          if (!inner.length) continue;
          st.inner = inner[0];
          break;
        }
        default:
          break;
      }
      out.push(st);
    }
    return out;
  };
  return strip(body);
}

export function stripTrailingDeep(body: Stmt[], fin: Stmt[]): Stmt[] {
  if (!fin.length) return body;
  for (const st of body) {
    switch (st.kind) {
      case 'if':
        st.thenS = stripTrailingDeep(st.thenS, fin);
        if (st.elseS) st.elseS = stripTrailingDeep(st.elseS, fin);
        break;
      case 'while':
      case 'do-while':
        st.body = stripTrailingDeep(st.body, fin);
        break;
      case 'for':
        st.body = stripTrailingDeep(st.body, fin);
        break;
      case 'foreach':
        st.body = stripTrailingDeep(st.body, fin);
        break;
      case 'switch':
        for (const c of st.cases) c.body = stripTrailingDeep(c.body, fin);
        break;
      case 'try':
        st.body = stripTrailingDeep(st.body, fin);
        for (const c of st.catches) c.body = stripTrailingDeep(c.body, fin);
        break;
      case 'sync':
        st.body = stripTrailingDeep(st.body, fin);
        break;
      default:
        break;
    }
  }
  return stripTrailing(body, fin);
}

function stripTrailing(body: Stmt[], fin: Stmt[]): Stmt[] {
  if (!fin.length) return body;
  if (body.length >= fin.length) {
    const tail = body.slice(body.length - fin.length);
    let ok = true;
    for (let i = 0; i < fin.length; i++) {
      if (JSON.stringify(normalizeStmt(tail[i])) !== JSON.stringify(normalizeStmt(fin[i])))
        ok = false;
    }
    if (ok) return body.slice(0, body.length - fin.length);
  }
  if (body.length >= fin.length + 1 && body[body.length - 1].kind === 'return') {
    const mid = body.slice(body.length - 1 - fin.length, body.length - 1);
    let ok = true;
    for (let i = 0; i < fin.length; i++) {
      if (JSON.stringify(normalizeStmt(mid[i])) !== JSON.stringify(normalizeStmt(fin[i])))
        ok = false;
    }
    if (ok) return [...body.slice(0, body.length - 1 - fin.length), body[body.length - 1]];
  }
  return body;
}

function normalizeStmt(s: Stmt): unknown {
  switch (s.kind) {
    case 'expr': {
      const e = s.expr;
      if (e.kind === 'assign-expr' && e.target.kind === 'local') {
        return { a: (e.target as { slot: number }).slot, e: normalizeExpr(e.expr) };
      }
      return { x: normalizeExpr(e) };
    }
    case 'if':
      return {
        i: normalizeExpr(s.cond),
        t: s.thenS.map(normalizeStmt),
        ...(s.elseS ? { e: s.elseS.map(normalizeStmt) } : {}),
      };
    case 'return':
      return { r: s.expr ? normalizeExpr(s.expr) : null };
    case 'throw':
      return { w: normalizeExpr(s.expr) };
    case 'while':
      return { s: s.kind, c: s.cond ? normalizeExpr(s.cond) : null, b: s.body.map(normalizeStmt) };
    case 'do-while':
      return { s: s.kind, c: normalizeExpr(s.cond), b: s.body.map(normalizeStmt) };
    case 'for':
      return {
        s: s.kind,
        i: s.init.map(normalizeStmt),
        c: s.cond ? normalizeExpr(s.cond) : null,
        u: s.update.map(normalizeStmt),
        b: s.body.map(normalizeStmt),
      };
    case 'foreach':
      return {
        s: s.kind,
        v: s.varName,
        it: normalizeExpr(s.iterable),
        b: s.body.map(normalizeStmt),
      };
    case 'switch':
      return {
        s: s.kind,
        sub: normalizeExpr(s.subject),
        c: s.cases.map((c) => ({ l: c.labels, b: c.body.map(normalizeStmt) })),
      };
    case 'try':
      return {
        s: s.kind,
        b: s.body.map(normalizeStmt),
        c: s.catches.map((c) => ({ t: c.type, b: c.body.map(normalizeStmt) })),
        ...(s.finallyS ? { f: s.finallyS.map(normalizeStmt) } : {}),
      };
    case 'sync':
      return { s: s.kind, m: normalizeExpr(s.monitor), b: s.body.map(normalizeStmt) };
    case 'label':
      return { s: s.kind, l: s.label, n: normalizeStmt(s.inner) };
    case 'local-decl':
      return { s: s.kind, n: s.name, ...(s.init ? { i: normalizeExpr(s.init) } : {}) };
    case 'break':
    case 'continue':
      return { s: s.kind, ...(s.label ? { l: s.label } : {}) };
    default:
      return { s: s.kind };
  }
}

function normalizeExpr(e: Expr): unknown {
  if (!e || typeof e !== 'object') return null;
  switch (e.kind) {
    case 'const':
      return { c: e.ctype, v: String(e.value) };
    case 'local':
      return { l: (e as { slot?: number }).slot };
    case 'this':
      return { t: 1 };
    case 'invoke':
      return {
        i: e.name,
        o: e.owner,
        t: e.target ? normalizeExpr(e.target) : null,
        a: e.args.map(normalizeExpr),
      };
    case 'field-get':
      return { f: e.name, o: e.owner, t: e.target ? normalizeExpr(e.target) : null };
    case 'binary':
      return { b: e.op, l: normalizeExpr(e.left), r: normalizeExpr(e.right) };
    case 'unary':
      return { u: e.op, e: normalizeExpr(e.operand) };
    case 'array-load':
      return { al: 1, a: normalizeExpr(e.array), i: normalizeExpr(e.index) };
    case 'cast':
      return normalizeExpr(e.expr);
    case 'monitor':
      return { m: normalizeExpr((e as { expr: Expr }).expr) };
    default:
      return e.kind;
  }
}
