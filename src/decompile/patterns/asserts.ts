import { negate as negateExpr } from '../../ast/conditions.js';
import { Expr, Stmt } from '../../ast/ast.js';
import { transformChildren } from './index.js';

export function foldAsserts(stmts: Stmt[]): Stmt[] {
  const out: Stmt[] = [];
  for (const s of stmts) {
    if (s.kind === 'if' && s.thenS.length === 1) {
      const inner = s.thenS[0];
      if (inner.kind === 'throw' && isAssertionErrorNew(inner.expr)) {
        const cond = stripAssertionDisabled(s.cond);
        if (cond.ok) {
          const args = (inner.expr as { args?: Expr[] }).args ?? [];
          const assertCond = negateExpr(cond.rest);
          out.push({ kind: 'assert', cond: assertCond, msg: args.length ? args[0] : undefined });
          if (s.elseS) out.push(...foldAsserts(s.elseS));
          continue;
        }
      }
    }
    transformChildren(s, (list) => foldAsserts(list));
    out.push(s);
  }
  return out;
}

function isAssertionErrorNew(e: Expr): boolean {
  return e.kind === 'new' && e.owner === 'java/lang/AssertionError';
}

function stripAssertionDisabled(cond: Expr): { ok: boolean; rest: Expr } {
  if (cond.kind === 'binary' && cond.op === '&&') {
    const l = cond.left;
    if (l.kind === 'unary' && l.op === '!' && isAssertionsDisabled(l.operand)) {
      return { ok: true, rest: cond.right };
    }
  }
  if (cond.kind === 'binary' && cond.op === '&&' && cond.left.kind === 'field-get') {
    if (isAssertionsDisabled(cond.left)) {
      return { ok: true, rest: cond.right };
    }
  }
  return { ok: false, rest: cond };
}

function isAssertionsDisabled(e: Expr): boolean {
  return e.kind === 'field-get' && e.name.startsWith('$assertionsDisabled');
}
