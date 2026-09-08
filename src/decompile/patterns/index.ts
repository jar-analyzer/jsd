import { parseMethodDescriptor } from '../../classfile/types.js';
import type { ClassFile, MethodInfo } from '../../classfile/model.js';
import type { Ctx } from '../context.js';
import type { SimResult } from '../simulate/index.js';
import { foldAsserts } from './asserts.js';
import {
  foldTernary,
  countSlotUses,
  ternaryToBool,
  firstReadExpectsBoolean,
  isPrimBool,
} from './ternary.js';
import { propagateTemps, foldBoolTernary } from './propagate.js';
import { hoistWideScopeLocals, markExternalForDecls, transformChildren } from './hoist.js';

export { foldAsserts } from './asserts.js';
export {
  foldTernary,
  countSlotUses,
  ternaryToBool,
  firstReadExpectsBoolean,
  isPrimBool,
} from './ternary.js';
export { foldBoolTernary } from './propagate.js';
export { hoistWideScopeLocals, markExternalForDecls, transformChildren } from './hoist.js';
export type { HoistResult } from './hoist.js';

export interface BoolFoldCtx {
  retIsBoolean: boolean;
  slotIsBoolean: (slot: number) => boolean;
  fieldIsBoolean: (owner: string, name: string) => boolean;
  ctorParamBoolean: (owner: string, argIdx: number, argc: number) => boolean;
}

function methodReturnsBoolean(m: MethodInfo): boolean {
  try {
    return isPrimBool(parseMethodDescriptor(m.descriptor).ret);
  } catch {
    return false;
  }
}

export function applyPatterns(
  ctx: Ctx,
  cls: ClassFile,
  method: MethodInfo,
  stmts: import('../../ast/ast.js').Stmt[],
  sim: SimResult,
): import('../../ast/ast.js').Stmt[] {
  const bctx: BoolFoldCtx = {
    retIsBoolean: methodReturnsBoolean(method),
    slotIsBoolean: (slot) => isPrimBool(ctx.slotInferredType(method, slot)),
    fieldIsBoolean: (owner, name) => isPrimBool(ctx.fieldTypeInfo(owner, name)),
    ctorParamBoolean: (owner, argIdx, argc) => {
      const c = ctx.lookup(owner);
      if (!c) return false;
      const ctors = c.methods.filter((mm) => mm.name === '<init>');
      let sigParams: { params: { kind: string; name?: string }[] } | null = null;
      for (const ct of ctors) {
        let pd: { params: { kind: string; name?: string }[] };
        try {
          pd = parseMethodDescriptor(ct.descriptor);
        } catch {
          continue;
        }
        if (pd.params.length === argc) {
          if (sigParams) return false;
          sigParams = pd;
        }
      }
      if (!sigParams) return false;
      const p = sigParams.params[argIdx];
      return !!p && p.kind === 'prim' && p.name === 'boolean';
    },
  };
  let out = stmts;
  out = foldAsserts(out, cls);
  out = foldTernary(out, sim, bctx);
  out = foldBoolTernary(out);
  for (let i = 0; i < 6; i++) {
    const next = propagateTemps(out, bctx);
    if (next === out) break;
    out = next;
  }
  return out;
}
