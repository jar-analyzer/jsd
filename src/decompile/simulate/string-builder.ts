import type { Expr } from '../../ast/ast.js';
import type { JType } from '../../classfile/types.js';
import { adaptPrimitiveValue } from '../calls.js';

export function concatAppendArgument(
  owner: string,
  params: JType[],
  ret: JType,
  args: Expr[],
): Expr | undefined {
  if (owner !== 'java/lang/StringBuilder' && owner !== 'java/lang/StringBuffer') return;
  if (params.length !== 1 || ret.kind !== 'class' || ret.name !== owner) return;
  const param = params[0];
  if (
    param.kind === 'prim' &&
    ['boolean', 'char', 'int', 'long', 'float', 'double'].includes(param.name)
  ) {
    return adaptPrimitiveValue(args[0], param);
  }
  if (param.kind === 'class' && param.name === 'java/lang/String') return args[0];
}

export function canConcatenateBuilder(parts: Expr[]): boolean {
  return parts.some((part) => !isConstantExpression(part));
}

function isConstantExpression(expr: Expr): boolean {
  switch (expr.kind) {
    case 'const':
      return true;
    case 'cast':
      return isConstantExpression(expr.expr);
    case 'unary':
      return ['+', '-', '~', '!'].includes(expr.op) && isConstantExpression(expr.operand);
    case 'binary':
      return isConstantExpression(expr.left) && isConstantExpression(expr.right);
    case 'ternary':
      return (
        isConstantExpression(expr.cond) &&
        isConstantExpression(expr.thenE) &&
        isConstantExpression(expr.elseE)
      );
    default:
      return false;
  }
}
