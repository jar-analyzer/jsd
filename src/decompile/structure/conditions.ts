import { Expr } from '../../ast/ast.js';
import { negate } from '../../ast/conditions.js';
export { negate };

export function isNegatedForm(e: Expr): boolean {
  return e.kind === 'unary' && e.op === '!';
}

export function canon(e: Expr): Expr {
  if (e.kind === 'unary' && e.op === '!') {
    const inner = e.operand;
    if (
      inner.kind === 'binary' ||
      inner.kind === 'local' ||
      inner.kind === 'invoke' ||
      inner.kind === 'instanceof'
    ) {
      return negate(inner);
    }
    if (inner.kind === 'unary' && inner.op === '!') return inner.operand;
  }
  return e;
}

export function or(a: Expr, b: Expr): Expr {
  return { kind: 'binary', op: '||', left: a, right: b };
}

export function and(a: Expr, b: Expr): Expr {
  return { kind: 'binary', op: '&&', left: a, right: b };
}

export function sameExpr(a: Expr, b: Expr): boolean {
  if (a.kind === 'local' && b.kind === 'local') return a.slot === b.slot;
  if (a.kind === 'this' && b.kind === 'this') return true;
  return a === b;
}

export function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
