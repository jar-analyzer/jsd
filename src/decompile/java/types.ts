import type { Expr } from '../../ast/ast.js';
import { expressionType } from '../../ast/types.js';
import type { JType } from '../../classfile/types.js';
import type { Ctx } from '../context.js';
import type { ScopeContext } from './scope.js';
import { adaptLambdaTarget } from '../calls.js';

export interface LocalContext extends ScopeContext {
  ctx: Ctx;
  slotTypes: Map<number, JType>;
}

export function anonSupertype(owner: string, ctx?: Ctx): JType | undefined {
  const simple = owner.slice(Math.max(owner.lastIndexOf('/'), owner.lastIndexOf('$')) + 1);
  if (!/^\d+$/.test(simple)) return undefined;
  const cls = ctx?.lookup(owner);
  if (cls) {
    if (cls.superName && cls.superName !== 'java/lang/Object')
      return { kind: 'class', name: cls.superName };
    if (cls.interfaces.length === 1) return { kind: 'class', name: cls.interfaces[0] };
  }
  return { kind: 'class', name: 'java/lang/Object' };
}

export function initialType(e: Expr, ctx?: Ctx): JType | undefined {
  return e.kind === 'new' ? (anonSupertype(e.owner, ctx) ?? expressionType(e)) : expressionType(e);
}

export function declarationValue(e: Expr, t: JType): Expr {
  e = adaptLambdaTarget(e, t);
  if (e.kind !== 'cast' || !sameType(e.jtype, t)) return e;
  const inner = e.expr;
  const actual = expressionType(inner);
  if (actual && sameType(actual, t)) return inner;
  if (actual?.kind === 'prim' && t.kind === 'prim' && wideningTo(actual.name, t.name)) return inner;
  if (inner.kind === 'const' && t.kind === 'prim' && fitsConstant(inner, t.name)) return inner;
  return e;
}

export function declarationType(
  rc: LocalContext,
  slot: number,
  init: Expr,
  targetJType?: JType,
): JType | undefined {
  if (targetJType) return targetJType;
  const lv = rc.slotTypes.get(slot);
  const inferred = initialType(init, rc.ctx);
  if (inferred && lv && typeKeyOf(inferred) !== typeKeyOf(lv)) {
    return inferred;
  }
  if (lv && inferred) {
    const lk = typeKeyOf(lv);
    const ik = typeKeyOf(inferred);
    if (lk === ik) return lv;
    const intFamily = (t: JType): boolean =>
      t.kind === 'prim' && ['int', 'boolean', 'char', 'short', 'byte'].includes(t.name);
    if (intFamily(lv) && intFamily(inferred)) return lv;
    if (lv.kind === 'class' && inferred.kind === 'class') {
      return lv;
    }
    if ((lv.kind === 'array') !== (inferred.kind === 'array')) {
      return inferred;
    }
    return inferred;
  }
  return lv ?? inferred;
}

export function compatibleTypes(a: JType, b: JType): boolean {
  if (typeKeyOf(a) === typeKeyOf(b)) return true;
  const intFamily = (t: JType): boolean =>
    t.kind === 'prim' && ['int', 'boolean', 'char', 'short', 'byte'].includes(t.name);
  if (intFamily(a) && intFamily(b)) return true;
  if (a.kind === 'prim' && b.kind === 'prim') {
    const rank: Record<string, number> = {
      byte: 1,
      short: 2,
      char: 2,
      int: 3,
      long: 4,
      float: 5,
      double: 6,
    };
    return (rank[a.name] ?? 0) <= (rank[b.name] ?? 0) || (rank[b.name] ?? 0) <= (rank[a.name] ?? 0);
  }
  if (
    a.kind === 'class' &&
    b.kind === 'class' &&
    (a.name === 'java/lang/Object' || b.name === 'java/lang/Object')
  )
    return true;
  return false;
}

function typeKeyOf(t: JType): string {
  switch (t.kind) {
    case 'prim':
      return t.name;
    case 'typevar':
      return 'T' + t.name;
    case 'wildcard':
      return '?';
    case 'array':
      return '[' + typeKeyOf(t.elem);
    case 'class':
      return t.name;
  }
}

function wideningTo(from: string, to: string): boolean {
  const targets: Record<string, readonly string[]> = {
    byte: ['short', 'int', 'long', 'float', 'double'],
    short: ['int', 'long', 'float', 'double'],
    char: ['int', 'long', 'float', 'double'],
    int: ['long', 'float', 'double'],
    long: ['float', 'double'],
    float: ['double'],
  };
  return targets[from]?.includes(to) ?? false;
}

function fitsConstant(e: Extract<Expr, { kind: 'const' }>, target: string): boolean {
  const v = e.value;
  if (!['int', 'char'].includes(e.ctype) || typeof v !== 'number') return false;
  switch (target) {
    case 'byte':
      return v >= -128 && v <= 127 && Number.isInteger(v);
    case 'short':
      return v >= -32768 && v <= 32767 && Number.isInteger(v);
    case 'char':
      return v >= 0 && v <= 65535 && Number.isInteger(v);
    case 'int':
      return v >= -2147483648 && v <= 2147483647 && Number.isInteger(v);
    case 'long':
      return Number.isInteger(v);
    case 'float':
    case 'double':
      return true;
    default:
      return false;
  }
}

function sameType(a: JType, b: JType): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'prim' && b.kind === 'prim') return a.name === b.name;
  if (a.kind === 'class' && b.kind === 'class') return a.name === b.name && !a.args && !b.args;
  return false;
}
