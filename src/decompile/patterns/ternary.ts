import { Expr, Stmt } from '../../ast/ast.js';
import { JType, parseMethodDescriptor } from '../../classfile/types.js';
import type { SimResult } from '../simulate/index.js';
import type { BoolFoldCtx } from './index.js';
import { transformChildren } from './index.js';

export function foldTernary(stmts: Stmt[], sim: SimResult, bctx?: BoolFoldCtx): Stmt[] {
  let cur = stmts;
  for (let round = 0; round < 10; round++) {
    const next = foldTernaryOnce(cur, sim, bctx);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

function foldTernaryOnce(stmts: Stmt[], sim: SimResult, bctx?: BoolFoldCtx): Stmt[] {
  void sim;
  const out: Stmt[] = [];
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    const t = tryFoldTernaryAt(s, stmts.slice(i + 1), bctx);
    if (t) {
      out.push(...t.replacement);
      return out;
    }
    transformChildren(s, (list) => foldTernaryOnce(list, sim, bctx));
    out.push(s);
  }
  return out;
}

interface TernaryFold {
  replacement: Stmt[];
}

function tryFoldTernaryAt(s: Stmt, rest: Stmt[], bctx?: BoolFoldCtx): TernaryFold | null {
  if (s.kind !== 'if' || !s.elseS) return null;
  const thenA = singleAssign(s.thenS);
  const elseA = singleAssign(s.elseS);
  if (!thenA || !elseA) return null;
  const [tSlot, tName, tExpr] = thenA;
  const [eSlot, , eExpr] = elseA;
  if (tSlot !== eSlot) return null;
  void tName;
  const writes = countSlotUses(rest, eSlot);
  if (writes.writes !== 0 || writes.reads !== 1) return null;
  const ternary: Expr = { kind: 'ternary', cond: s.cond, thenE: tExpr, elseE: eExpr };
  let form = ternaryToBool(ternary);
  if (!form && bctx) {
    const asBool = intTernaryToBool(ternary);
    if (asBool && firstReadExpectsBoolean(rest, eSlot, bctx)) form = asBool;
  }
  const replaced = replaceFirstRead(rest, eSlot, form ?? ternary);
  if (!replaced) return null;
  return { replacement: replaced };
}

function singleAssign(list: Stmt[]): [number, string, Expr] | null {
  if (list.length !== 1) return null;
  const s = list[0];
  if (s.kind !== 'expr' || s.expr.kind !== 'assign-expr') return null;
  if (s.expr.target.kind !== 'local') return null;
  if (s.expr.op) return null;
  return [
    (s.expr.target as { slot: number; name: string }).slot,
    (s.expr.target as { slot: number; name: string }).name,
    s.expr.expr,
  ];
}

export function countSlotUses(list: Stmt[], slot: number): { reads: number; writes: number } {
  let reads = 0,
    writes = 0;
  const visitExpr = (e: Expr): void => {
    walkExprLocal(e, (x) => {
      if (x.kind === 'local' && x.slot === slot) reads++;
    });
  };
  const visit = (stmts: Stmt[]): void => {
    for (const st of stmts) {
      switch (st.kind) {
        case 'expr': {
          const e = st.expr;
          if (e.kind === 'assign-expr' && e.target.kind === 'local') {
            if ((e.target as { slot: number }).slot === slot) writes++;
            visitExpr(e.expr);
          } else if (
            e.kind === 'unary' &&
            ['x++', 'x--', '++x', '--x'].includes(e.op) &&
            e.operand.kind === 'local' &&
            (e.operand as { slot: number }).slot === slot
          ) {
            writes++;
          } else {
            visitExpr(e);
          }
          break;
        }
        case 'if':
          visitExpr(st.cond);
          visit(st.thenS);
          if (st.elseS) visit(st.elseS);
          break;
        case 'while':
          if (st.cond) visitExpr(st.cond);
          visit(st.body);
          break;
        case 'do-while':
          visitExpr(st.cond);
          visit(st.body);
          break;
        case 'for':
          visit(st.init);
          if (st.cond) visitExpr(st.cond);
          visit(st.update);
          visit(st.body);
          break;
        case 'foreach':
          visitExpr(st.iterable);
          visit(st.body);
          break;
        case 'switch':
          visitExpr(st.subject);
          for (const c of st.cases) visit(c.body);
          break;
        case 'return':
          if (st.expr) visitExpr(st.expr);
          break;
        case 'throw':
          visitExpr(st.expr);
          break;
        case 'assert':
          visitExpr(st.cond);
          if (st.msg) visitExpr(st.msg);
          break;
        case 'sync':
          visitExpr(st.monitor);
          visit(st.body);
          break;
        case 'local-decl':
          if (st.init) visitExpr(st.init);
          break;
        case 'label':
          visit([st.inner]);
          break;
        default:
          break;
      }
    }
  };
  visit(list);
  return { reads, writes };
}

function walkExprLocal(e: Expr, fn: (e: Expr) => void): void {
  fn(e);
  switch (e.kind) {
    case 'binary':
      walkExprLocal(e.left, fn);
      walkExprLocal(e.right, fn);
      break;
    case 'unary':
      walkExprLocal(e.operand, fn);
      break;
    case 'cast':
      walkExprLocal(e.expr, fn);
      break;
    case 'instanceof':
      walkExprLocal(e.expr, fn);
      break;
    case 'invoke':
      if (e.target) walkExprLocal(e.target, fn);
      e.args.forEach((a) => walkExprLocal(a, fn));
      break;
    case 'new':
      e.args.forEach((a) => walkExprLocal(a, fn));
      if (e.outer) walkExprLocal(e.outer, fn);
      break;
    case 'new-array':
      e.dimsExprs.forEach((d) => walkExprLocal(d, fn));
      break;
    case 'array-init':
      e.values.forEach((v) => walkExprLocal(v, fn));
      break;
    case 'array-length':
      walkExprLocal(e.array, fn);
      break;
    case 'array-load':
      walkExprLocal(e.array, fn);
      walkExprLocal(e.index, fn);
      break;
    case 'field-get':
      if (e.target) walkExprLocal(e.target, fn);
      break;
    case 'assign-expr':
      walkExprLocal(e.expr, fn);
      break;
    case 'concat':
      e.parts.forEach((p) => walkExprLocal(p, fn));
      break;
    case 'ternary':
      walkExprLocal(e.cond, fn);
      walkExprLocal(e.thenE, fn);
      walkExprLocal(e.elseE, fn);
      break;
    case 'bool':
      walkExprLocal(e.inner, fn);
      break;
    default:
      break;
  }
}

export function replaceFirstRead(list: Stmt[], slot: number, replacement: Expr): Stmt[] | null {
  let done = false;
  const visitExpr = (e: Expr): Expr => {
    if (done || !e || typeof e !== 'object') return e;
    if (e.kind === 'local' && e.slot === slot) {
      done = true;
      return replacement;
    }
    switch (e.kind) {
      case 'binary':
        e.left = visitExpr(e.left);
        e.right = visitExpr(e.right);
        return e;
      case 'unary':
        e.operand = visitExpr(e.operand);
        return e;
      case 'cast':
        e.expr = visitExpr(e.expr);
        return e;
      case 'instanceof':
        e.expr = visitExpr(e.expr);
        return e;
      case 'invoke':
        if (e.target) e.target = visitExpr(e.target);
        e.args = e.args.map(visitExpr);
        return e;
      case 'new':
        e.args = e.args.map(visitExpr);
        if (e.outer) e.outer = visitExpr(e.outer);
        return e;
      case 'new-array':
        e.dimsExprs = e.dimsExprs.map(visitExpr);
        return e;
      case 'array-init':
        e.values = e.values.map(visitExpr);
        return e;
      case 'array-length':
        e.array = visitExpr(e.array);
        return e;
      case 'array-load':
        e.array = visitExpr(e.array);
        e.index = visitExpr(e.index);
        return e;
      case 'field-get':
        if (e.target) e.target = visitExpr(e.target);
        return e;
      case 'assign-expr':
        e.expr = visitExpr(e.expr);
        return e;
      case 'concat':
        e.parts = e.parts.map(visitExpr);
        return e;
      case 'ternary':
        e.cond = visitExpr(e.cond);
        e.thenE = visitExpr(e.thenE);
        e.elseE = visitExpr(e.elseE);
        return e;
      case 'bool':
        e.inner = visitExpr(e.inner);
        return e;
      default:
        return e;
    }
  };
  const visit = (stmts: Stmt[]): Stmt[] =>
    stmts.map((st) => {
      switch (st.kind) {
        case 'expr':
          return { ...st, expr: visitExpr(st.expr) };
        case 'if':
          return {
            ...st,
            cond: visitExpr(st.cond),
            thenS: visit(st.thenS),
            elseS: st.elseS ? visit(st.elseS) : undefined,
          };
        case 'while':
          return { ...st, cond: st.cond ? visitExpr(st.cond) : null, body: visit(st.body) };
        case 'do-while':
          return { ...st, cond: visitExpr(st.cond), body: visit(st.body) };
        case 'for':
          return {
            ...st,
            init: visit(st.init),
            cond: st.cond ? visitExpr(st.cond) : null,
            update: visit(st.update),
            body: visit(st.body),
          };
        case 'foreach':
          return { ...st, iterable: visitExpr(st.iterable), body: visit(st.body) };
        case 'switch':
          return {
            ...st,
            subject: visitExpr(st.subject),
            cases: st.cases.map((c) => ({ ...c, body: visit(c.body) })),
          };
        case 'return':
          return { ...st, expr: st.expr ? visitExpr(st.expr) : undefined };
        case 'throw':
          return { ...st, expr: visitExpr(st.expr) };
        case 'assert':
          return { ...st, cond: visitExpr(st.cond), msg: st.msg ? visitExpr(st.msg) : undefined };
        case 'sync':
          return { ...st, monitor: visitExpr(st.monitor), body: visit(st.body) };
        case 'local-decl':
          return { ...st, init: st.init ? visitExpr(st.init) : undefined };
        default:
          return st;
      }
    });
  const result = visit(list);
  return done ? result : null;
}

export function ternaryToBool(t: Expr): Expr | null {
  if (t.kind !== 'ternary') return null;
  const { thenE, elseE } = t;
  const isTrue = (e: Expr): boolean =>
    e.kind === 'const' && e.ctype === 'boolean' && (e.value === true || e.value === 1);
  const isFalse = (e: Expr): boolean =>
    e.kind === 'const' && e.ctype === 'boolean' && (e.value === false || e.value === 0);
  if (isTrue(thenE) && isFalse(elseE)) return t.cond;
  if (isFalse(thenE) && isTrue(elseE)) return { kind: 'unary', op: '!', operand: t.cond };
  return null;
}

export function intTernaryToBool(t: Expr): Expr | null {
  if (t.kind !== 'ternary') return null;
  const isInt = (e: Expr, v: number): boolean =>
    e.kind === 'const' && e.ctype === 'int' && e.value === v;
  if (isInt(t.thenE, 1) && isInt(t.elseE, 0)) return t.cond;
  if (isInt(t.thenE, 0) && isInt(t.elseE, 1)) return { kind: 'unary', op: '!', operand: t.cond };
  return null;
}

export function firstReadExpectsBoolean(list: Stmt[], slot: number, bctx: BoolFoldCtx): boolean {
  let answer: boolean | null = null;
  const paramBool = (desc: string, idx: number): boolean => {
    try {
      return isPrimBool(parseMethodDescriptor(desc).params[idx]);
    } catch {
      return false;
    }
  };
  const assignTargetBool = (e: Extract<Expr, { kind: 'assign-expr' }>): boolean => {
    if (e.op) return false;
    const t = e.target;
    if (t.kind === 'local') return isPrimBool(t.jtype) || bctx.slotIsBoolean(t.slot);
    if (t.kind === 'field') return bctx.fieldIsBoolean(t.owner, t.name);
    if (t.kind === 'array') {
      const at = (t.array as { jtype?: JType }).jtype;
      return !!at && at.kind === 'array' && isPrimBool(at.elem);
    }
    return false;
  };
  const checkExpr = (e: Expr, expect: boolean): void => {
    if (answer !== null || !e || typeof e !== 'object') return;
    if (e.kind === 'local' && e.slot === slot) {
      answer = expect;
      return;
    }
    switch (e.kind) {
      case 'unary':
        checkExpr(e.operand, e.op === '!');
        break;
      case 'binary': {
        const boolOp = e.op === '&&' || e.op === '||';
        checkExpr(e.left, boolOp);
        checkExpr(e.right, boolOp);
        break;
      }
      case 'ternary':
        checkExpr(e.cond, true);
        checkExpr(e.thenE, isPrimBool(e.jtype));
        checkExpr(e.elseE, isPrimBool(e.jtype));
        break;
      case 'cast':
        checkExpr(e.expr, false);
        break;
      case 'instanceof':
        checkExpr(e.expr, false);
        break;
      case 'invoke': {
        if (e.target) checkExpr(e.target, false);
        e.args.forEach((a, i) => checkExpr(a, paramBool(e.descriptor, i)));
        break;
      }
      case 'new':
        e.args.forEach((a, i) => checkExpr(a, bctx.ctorParamBoolean(e.owner, i, e.args.length)));
        if (e.outer) checkExpr(e.outer, false);
        break;
      case 'new-array':
        e.dimsExprs.forEach((d) => checkExpr(d, false));
        break;
      case 'array-init':
        e.values.forEach((v) => checkExpr(v, isPrimBool(e.elemType)));
        break;
      case 'array-length':
        checkExpr(e.array, false);
        break;
      case 'array-load':
        checkExpr(e.array, false);
        checkExpr(e.index, false);
        break;
      case 'field-get':
        if (e.target) checkExpr(e.target, false);
        break;
      case 'assign-expr':
        checkExpr(e.expr, assignTargetBool(e));
        break;
      case 'concat':
        e.parts.forEach((p, i) => checkExpr(p, isPrimBool(e.partTypes?.[i])));
        break;
      case 'bool':
        checkExpr(e.inner, true);
        break;
      default:
        break;
    }
  };
  const check = (stmts: Stmt[]): void => {
    for (const st of stmts) {
      if (answer !== null) return;
      switch (st.kind) {
        case 'expr': {
          const e = st.expr;
          if (e.kind === 'assign-expr') checkExpr(e.expr, assignTargetBool(e));
          else checkExpr(e, false);
          break;
        }
        case 'if':
          checkExpr(st.cond, true);
          check(st.thenS);
          if (st.elseS) check(st.elseS);
          break;
        case 'while':
          if (st.cond) checkExpr(st.cond, true);
          check(st.body);
          break;
        case 'do-while':
          checkExpr(st.cond, true);
          check(st.body);
          break;
        case 'for':
          check(st.init);
          if (st.cond) checkExpr(st.cond, true);
          check(st.update);
          check(st.body);
          break;
        case 'foreach':
          checkExpr(st.iterable, false);
          check(st.body);
          break;
        case 'switch':
          checkExpr(st.subject, false);
          for (const c of st.cases) check(c.body);
          break;
        case 'return':
          if (st.expr) checkExpr(st.expr, bctx.retIsBoolean);
          break;
        case 'throw':
          checkExpr(st.expr, false);
          break;
        case 'assert':
          checkExpr(st.cond, true);
          if (st.msg) checkExpr(st.msg, false);
          break;
        case 'sync':
          checkExpr(st.monitor, false);
          check(st.body);
          break;
        case 'local-decl':
          if (st.init) checkExpr(st.init, isPrimBool(st.jtype));
          break;
        case 'label':
          check([st.inner]);
          break;
        default:
          break;
      }
    }
  };
  check(list);
  return answer === true;
}

export function isPrimBool(t: JType | undefined): boolean {
  return !!t && t.kind === 'prim' && t.name === 'boolean';
}
