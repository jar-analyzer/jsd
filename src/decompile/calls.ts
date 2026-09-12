import type { Expr } from '../ast/ast.js';
import { expressionType } from '../ast/types.js';
import { parseMethodDescriptor, type JType } from '../classfile/types.js';
import type { Ctx } from './context.js';

export function adaptCallArgument(
  a: Expr,
  descriptor: string | undefined,
  i: number,
  ctx: Ctx,
  owner: string,
  name: string,
  rawReceiver = false,
  allowUnknownOverloads = false,
  actual = expressionType(a),
): Expr {
  if (!descriptor) return a;
  const signature = parseMethodDescriptor(descriptor);
  const pt = signature.params[i];
  const at = actual;
  if (!pt) return a;
  if (pt.kind === 'prim') return adaptPrimitiveValue(a, pt, at);
  if (
    a.kind === 'invoke' &&
    a.owner === 'java/lang/invoke/LambdaMetafactory' &&
    at?.kind === 'class' &&
    (rawReceiver || (pt.kind === 'class' && pt.name === 'java/lang/Object'))
  ) {
    return { kind: 'cast', jtype: at, expr: { ...a, erasedLambda: true } };
  }
  if (
    hasReferenceOverload(ctx, owner, name, descriptor, i, allowUnknownOverloads) &&
    (!at || erasedType(at) !== erasedType(pt))
  ) {
    return { kind: 'cast', jtype: pt, expr: a };
  }
  return a;
}

function erasedType(t: JType): string {
  return t.kind === 'array' ? '[' + erasedType(t.elem) : t.kind === 'wildcard' ? '?' : t.name;
}

function hasReferenceOverload(
  ctx: Ctx,
  owner: string,
  name: string,
  descriptor: string,
  index: number,
  allowUnknown: boolean,
): boolean {
  const wanted = parseMethodDescriptor(descriptor);
  const visited = new Set<string>();
  const visit = (cn: string): boolean => {
    if (visited.has(cn)) return false;
    visited.add(cn);
    const cf = ctx.lookup(cn);
    if (!cf) return allowUnknown && cn === owner;
    for (const m of cf.methods) {
      if (m.name !== name || m.descriptor === descriptor || m.access & 0x1040) continue;
      const md = parseMethodDescriptor(m.descriptor);
      if (
        md.params.length === wanted.params.length &&
        md.params[index] &&
        erasedType(md.params[index]) !== erasedType(wanted.params[index])
      )
        return true;
    }
    return (
      name !== '<init>' && [...cf.interfaces, ...(cf.superName ? [cf.superName] : [])].some(visit)
    );
  };
  return visit(owner);
}

export function adaptPrimitiveValue(a: Expr, target: JType, actual = expressionType(a)): Expr {
  if (target.kind !== 'prim') return a;
  if (a.kind === 'const' && a.ctype === 'int') {
    if (target.name === 'boolean' && (a.value === 0 || a.value === 1))
      return { kind: 'const', ctype: 'boolean', value: a.value === 1 };
    if (target.name === 'char') return { kind: 'const', ctype: 'char', value: a.value };
  }
  if (actual?.kind !== 'prim' || actual.name === target.name) return a;
  if (target.name === 'boolean')
    return { kind: 'binary', op: '!=', left: a, right: { kind: 'const', ctype: 'int', value: 0 } };
  if (actual.name === 'boolean')
    return {
      kind: 'ternary',
      cond: a,
      thenE: { kind: 'const', ctype: 'int', value: 1 },
      elseE: { kind: 'const', ctype: 'int', value: 0 },
    };
  return { kind: 'cast', jtype: target, expr: a };
}

export function adaptLambdaTarget(expr: Expr, target: JType | undefined): Expr {
  if (
    expr.kind === 'invoke' &&
    expr.owner === 'java/lang/invoke/LambdaMetafactory' &&
    target?.kind === 'class' &&
    !target.args?.length
  ) {
    const actual = expressionType(expr);
    if (actual?.kind === 'class' && actual.name === target.name)
      return { ...expr, erasedLambda: true };
  }
  return expr;
}
