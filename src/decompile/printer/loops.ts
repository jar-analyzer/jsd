import type { Stmt } from '../../ast/ast.js';
import { PREC, type RenderCtx } from './context.js';
import { declaredNameOf, declareSlot, outerNameClash, uniqueName } from '../java/scope.js';
import { declarationType, declarationValue } from '../java/types.js';
import { exprStr } from './expr.js';
import { typeStr } from './types.js';

export function forInitDeclOutside(s: Stmt, rc: RenderCtx): string | null {
  if (s.kind !== 'expr' || s.expr.kind !== 'assign-expr' || s.expr.target.kind !== 'local')
    return null;
  const slot = (s.expr.target as { slot: number }).slot;
  const targetName = (s.expr.target as { name: string }).name;
  const existing0 = declaredNameOf(rc, slot);
  if (existing0 !== undefined && existing0 === targetName) return null;
  const t = declarationType(rc, slot, s.expr.expr);
  declareSlot(rc, slot, targetName, t);
  if (t)
    return `${typeStr(t, rc)} ${targetName} = ${exprStr(declarationValue(s.expr.expr, t), rc, PREC.lambda)};`;
  return `${targetName} = ${exprStr(s.expr.expr, rc, PREC.lambda)};`;
}

export function forInitStr(s: Stmt, rc: RenderCtx, noDeclare = false): string {
  if (s.kind !== 'expr') return '';
  const e = s.expr;
  if (e.kind === 'assign-expr' && e.target.kind === 'local') {
    const slot = (e.target as { slot: number }).slot;
    const targetName = (e.target as { name: string }).name;
    const existing = declaredNameOf(rc, slot);
    if (
      !noDeclare &&
      (existing === undefined || (existing !== targetName && !existing.startsWith(targetName)))
    ) {
      const t = declarationType(rc, slot, e.expr);
      const name = outerNameClash(rc, slot, targetName) ? uniqueName(rc, targetName) : targetName;
      declareSlot(rc, slot, name, t);
      if (t)
        return `${typeStr(t, rc)} ${name} = ${exprStr(declarationValue(e.expr, t), rc, PREC.lambda)}`;
      return `${name} = ${exprStr(e.expr, rc, PREC.lambda)}`;
    }
    return `${existing} = ${exprStr(e.expr, rc, PREC.lambda)}`;
  }
  return exprStr(e, rc, PREC.lambda);
}
