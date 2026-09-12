import type { Expr } from '../../ast/ast.js';
import { expressionType } from '../../ast/types.js';
import { parseMethodDescriptor, parseSignature, type JType } from '../../classfile/types.js';
import { type Ctx, typeKey } from '../context.js';
import { adaptCallArgument, adaptPrimitiveValue } from '../calls.js';
import { directCollectionCall } from '../collection-calls.js';

export function prepareExpression(
  e: Expr,
  ctx: Ctx,
  currentClass?: string,
  locals?: ReadonlyMap<number, JType>,
): Expr {
  if (e.kind === 'invoke' && !e.bootstrap) {
    const receiver = e.target ? expressionType(e.target) : undefined;
    const directCollection = directCollectionCall(e, ctx, currentClass);
    const raw =
      receiver?.kind === 'class' &&
      !receiver.args?.length &&
      !ctx.methodInfo(e.owner, e.name, e.descriptor)?.m.signature;
    const args = e.args.map((arg, i) =>
      adaptCallArgument(
        arg,
        e.descriptor,
        i,
        ctx,
        e.owner,
        e.name,
        raw,
        !directCollection,
        expressionType(arg, (slot) => locals?.get(slot)),
      ),
    );
    const ownerType: JType = { kind: 'class', name: e.owner };
    const rawTarget =
      e.target &&
      ['local', 'cast', 'new'].includes(e.target.kind) &&
      sameRawReferenceType(receiver, ownerType);
    const target =
      e.target &&
      !e.superCall &&
      !rawTarget &&
      !ctx.lookup(e.owner) &&
      args.some((arg, i) => arg !== e.args[i] && arg.kind === 'cast' && arg.jtype.kind !== 'prim')
        ? {
            kind: 'cast' as const,
            jtype: ownerType,
            expr: e.target,
          }
        : e.target;
    const ret = parseMethodDescriptor(e.descriptor).ret;
    const signature = ctx.methodInfo(e.owner, e.name, e.descriptor)?.m.signature;
    const generic = signature ? parseSignature(signature) : undefined;
    const genericResult =
      generic && !('kind' in generic) && !sameRawReferenceType(generic.ret, ret);
    const eraseResult =
      ret.kind !== 'prim' &&
      (!!genericResult ||
        (!ctx.lookup(e.owner) &&
          (directCollection?.eraseResult ||
            args.some(
              (arg, i) => arg !== e.args[i] && arg.kind === 'cast' && arg.jtype.kind !== 'prim',
            ))));
    return { ...e, target, args, eraseResult };
  }
  if (e.kind === 'new')
    return {
      ...e,
      args: e.args.map((arg, i) =>
        adaptCallArgument(
          arg,
          e.descriptor,
          i,
          ctx,
          e.owner,
          '<init>',
          false,
          true,
          expressionType(arg, (slot) => locals?.get(slot)),
        ),
      ),
    };
  if (e.kind === 'assign-expr' && e.target.kind === 'field') {
    const type = e.target.jtype ?? ctx.fieldTypeInfo(e.target.owner, e.target.name);
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
  const actual = expressionType(expr, (slot) => locals?.get(slot));
  if (type && genericArrayOrVariable(type) && (!actual || typeKey(actual) !== typeKey(type)))
    return { kind: 'cast', jtype: type, expr };
  if (
    type?.kind === 'prim' &&
    type.name === 'boolean' &&
    actual?.kind === 'prim' &&
    actual.name !== 'boolean' &&
    !(expr.kind === 'const' && (expr.value === 0 || expr.value === 1))
  ) {
    expr = {
      kind: 'binary',
      op: '&',
      left: expr,
      right: { kind: 'const', ctype: 'int', value: 1 },
      jtype: { kind: 'prim', name: 'int' },
    };
  }
  return type
    ? adaptPrimitiveValue(
        expr,
        type,
        expressionType(expr, (slot) => locals?.get(slot)),
      )
    : expr;
}

function genericArrayOrVariable(type: JType): boolean {
  return type.kind === 'typevar' || (type.kind === 'array' && genericArrayOrVariable(type.elem));
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

export function sameRawReferenceType(a: JType | undefined, b: JType | undefined): boolean {
  if (a?.kind === 'array' && b?.kind === 'array') {
    if (a.elem.kind === 'prim' && b.elem.kind === 'prim') return a.elem.name === b.elem.name;
    return sameRawReferenceType(a.elem, b.elem);
  }
  return (
    a?.kind === 'class' &&
    b?.kind === 'class' &&
    a.name === b.name &&
    !a.args?.length &&
    !b.args?.length
  );
}
