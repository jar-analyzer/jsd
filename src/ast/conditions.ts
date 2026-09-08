import type { Expr } from './ast.js';

export function negate(e: Expr): Expr {
  if (e.kind === 'unary' && e.op === '!') return e.operand;
  if (e.kind === 'binary') {
    const inv: Record<string, string> = {
      '==': '!=',
      '!=': '==',
      '<': '>=',
      '>=': '<',
      '>': '<=',
      '<=': '>',
    };
    if (inv[e.op] && !(e.floatingComparison && ['<', '>', '<=', '>='].includes(e.op)))
      return { ...e, op: inv[e.op] as never };
  }
  if (e.kind === 'const' && e.ctype === 'boolean') return { ...e, value: !e.value };
  return { kind: 'unary', op: '!', operand: e };
}
