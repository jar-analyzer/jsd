import { walkExpr, type Expr } from '../../ast/ast.js';

export function writtenLocals(expressions: Expr[]): Set<number> {
  const slots = new Set<number>();
  const visit = (expr: Expr): void => {
    if (
      expr.kind === 'unary' &&
      ['x++', 'x--', '++x', '--x'].includes(expr.op) &&
      expr.operand.kind === 'local'
    ) {
      slots.add(expr.operand.slot);
    }
    if (expr.kind !== 'assign-expr') return;
    const target = expr.target;
    if (target.kind === 'local') slots.add(target.slot);
    if (target.kind === 'field' && target.target) walkExpr(target.target, visit);
    if (target.kind === 'array') {
      walkExpr(target.array, visit);
      walkExpr(target.index, visit);
    }
  };
  expressions.forEach((expr) => walkExpr(expr, visit));
  return slots;
}
