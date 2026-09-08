import type { Expr } from '../../ast/ast.js';
import { expressionType } from '../../ast/types.js';
import type { JType } from '../../classfile/types.js';
import type { Ctx } from '../context.js';
import { adaptCallArgument, adaptPrimitiveValue } from '../calls.js';

export function prepareExpression(e: Expr, ctx: Ctx): Expr {
  if (e.kind === 'invoke' && !e.bootstrap) {
    const receiver = e.target ? expressionType(e.target) : undefined;
    const raw =
      receiver?.kind === 'class' &&
      !receiver.args?.length &&
      !ctx.methodInfo(e.owner, e.name, e.descriptor)?.m.signature;
    return {
      ...e,
      args: e.args.map((arg, i) =>
        adaptCallArgument(
          arg,
          e.descriptor,
          i,
          ctx,
          e.owner,
          e.name,
          raw,
          e.mode === 'static' || raw,
        ),
      ),
    };
  }
  if (e.kind === 'new')
    return {
      ...e,
      args: e.args.map((arg, i) => adaptCallArgument(arg, e.descriptor, i, ctx, e.owner, '<init>')),
    };
  if (e.kind === 'assign-expr' && e.target.kind === 'field') {
    const type = ctx.fieldTypeInfo(e.target.owner, e.target.name);
    if (type) return { ...e, expr: adaptPrimitiveValue(e.expr, type) };
  }
  if (e.kind === 'array-init')
    return { ...e, values: e.values.map((value) => adaptConst(value, e.elemType)) };
  if (e.kind === 'concat') {
    const parts = e.parts.map((part, i) => {
      const type = e.partTypes?.[i];
      return type?.kind === 'prim' ? adaptPrimitiveValue(part, type) : part;
    });
    if (parts[0]?.kind !== 'const' || parts[0].ctype !== 'string')
      parts.unshift({ kind: 'const', ctype: 'string', value: '' });
    return { ...e, parts };
  }
  return e;
}

export function prepareReturnValue(
  expr: Expr,
  type?: JType,
  locals?: ReadonlyMap<number, JType>,
): Expr {
  return type
    ? adaptPrimitiveValue(
        expr,
        type,
        expressionType(expr, (slot) => locals?.get(slot)),
      )
    : expr;
}

function adaptConst(v: Expr, targetType: JType): Expr {
  if (targetType.kind !== 'prim' || v.kind !== 'const' || v.ctype !== 'int') return v;
  if (targetType.name === 'boolean' && (v.value === 0 || v.value === 1)) {
    return { kind: 'const', ctype: 'boolean', value: v.value === 1 };
  }
  if (targetType.name === 'char') {
    const c = v.value as number;
    if (c >= 0x20 && c < 0x7f && c !== 0x5c && c !== 0x27) {
      return { kind: 'const', ctype: 'char', value: c, jtype: targetType };
    }
  }
  return v;
}
