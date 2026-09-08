import type { Expr } from '../../ast/ast.js';
import type { ExprStack } from './stack.js';
import { writtenLocals } from './local-writes.js';
import { SimFail } from './result.js';

export function discardOperands(
  stack: ExprStack,
  wide: boolean,
  preserve: (expr: Expr, index: number, retain: boolean) => Expr,
): void {
  const top = stack.popSE();
  const values = [top];
  if (!wide && top.w) throw new SimFail('pop requires a category-1 value');
  if (wide && !top.w) {
    const below = stack.popSE();
    if (below.w) throw new SimFail('pop2 requires one category-2 or two category-1 values');
    values.unshift(below);
  }
  if (values.some((value) => !['const', 'local', 'this', 'super'].includes(value.e.kind))) {
    const writes = writtenLocals([...stack.items, ...values].map((item) => item.e));
    const saved = new Map<Expr, Expr>();
    stack.items.forEach((item, index) => {
      const original = item.e;
      if (original.kind === 'local' && !writes.has(original.slot)) return;
      item.e = saved.get(original) ?? preserve(original, index, true);
      saved.set(original, item.e);
    });
  }
  values.forEach((value, index) => preserve(value.e, stack.depth + index, false));
}
