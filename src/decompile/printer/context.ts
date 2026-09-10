export {
  declaredNameOf,
  outerNameClash,
  uniqueName,
  lookupDeclared,
  declareSlot,
} from '../java/scope.js';
import type { ScopeContext } from '../java/scope.js';
import { BinOp, Stmt, Expr } from '../../ast/ast.js';
import type { JType } from '../../classfile/types.js';
import type { Ctx } from '../context.js';
import { decodeBytecode } from '../../bytecode/decode.js';
import { renderStmts as renderStmtsInner } from './stmt.js';

export const PREC = {
  postfix: 17,
  unary: 16,
  cast: 15,
  mul: 13,
  add: 12,
  shift: 11,
  rel: 10,
  eq: 9,
  band: 8,
  bxor: 7,
  bor: 6,
  and: 5,
  or: 4,
  ternary: 3,
  assign: 2,
  lambda: 1,
};

export function binPrec(op: BinOp): number {
  switch (op) {
    case '*':
    case '/':
    case '%':
      return PREC.mul;
    case '+':
    case '-':
      return PREC.add;
    case '<<':
    case '>>':
    case '>>>':
      return PREC.shift;
    case '<':
    case '>':
    case '<=':
    case '>=':
      return PREC.rel;
    case '==':
    case '!=':
      return PREC.eq;
    case '&':
      return PREC.band;
    case '^':
      return PREC.bxor;
    case '|':
      return PREC.bor;
    case '&&':
      return PREC.and;
    case '||':
      return PREC.or;
    case 'cmp':
      return PREC.eq;
  }
}

export interface RenderCtx extends ScopeContext {
  ctx: Ctx;
  returnType?: JType;
  className: string;
  slotTypes: Map<number, JType>;
  refs: Set<string>;
  nameResolver?: (internal: string) => string;
  lambdaResolver?: (e: import('../../ast/ast.js').Expr) => string | null;
  slotLvtTypes?: Map<number, JType[]>;
  fieldValues?: ReadonlyMap<string, Expr>;
  anonClasses?: Map<string, AnonInfo>;
  localClasses?: Map<string, { simpleName: string; dropFirstArg: boolean }>;
}

export interface AnonInfo {
  superInternal: string;
  dropFirstArg: boolean;
  captureFields?: { name: string; index: number; type: JType }[];
  superArgIndices?: number[];
  renderMembers: (captures: ReadonlyMap<string, Expr>) => string[];
}

export function renderBlock(stmts: Stmt[], rc: RenderCtx, indent: number): string[] {
  rc.scopes.push(new Map());
  try {
    return renderStmtsInner(stmts, rc, indent);
  } finally {
    rc.scopes.pop();
  }
}

const accessorCache = new WeakMap<
  object,
  Map<string, { kind: 'get' | 'set'; field: string } | null>
>();

export function resolveAccessor(
  rc: RenderCtx,
  owner: string,
  name: string,
): { kind: 'get' | 'set'; field: string } | null {
  if (!/^access\$\d+$/.test(name)) return null;
  const cf = rc.ctx.lookup(owner);
  if (!cf) return null;
  let cache = accessorCache.get(rc.ctx);
  if (!cache) {
    cache = new Map();
    accessorCache.set(rc.ctx, cache);
  }
  const key = owner + '#' + name;
  if (cache.has(key)) return cache.get(key)!;
  const m = cf.methods.find((mm) => mm.name === name && mm.access & 0x1000);
  let result: { kind: 'get' | 'set'; field: string } | null = null;
  if (m?.code) {
    try {
      const ins = decodeBytecode(m.code.code);
      if (
        ins.length === 3 &&
        ins[0].name === 'aload_0' &&
        ins[1].name === 'getfield' &&
        /return$/.test(ins[2].name)
      ) {
        result = { kind: 'get', field: cf.cp.memberRef(ins[1].cpIndex!).name };
      } else if (
        ins.length === 4 &&
        ins[0].name === 'aload_0' &&
        /^(i|l|f|d|a)load(_\d+)?$/.test(ins[1].name) &&
        ins[2].name === 'putfield' &&
        ins[3].name === 'return'
      ) {
        result = { kind: 'set', field: cf.cp.memberRef(ins[2].cpIndex!).name };
      }
    } catch {
      result = null;
    }
  }
  cache.set(key, result);
  return result;
}

export function resolve(internal: string, rc: RenderCtx): string {
  const lc = rc.localClasses?.get(internal);
  if (lc) return lc.simpleName;
  rc.refs.add(internal);
  return rc.nameResolver ? rc.nameResolver(internal) : rc.ctx.className(internal);
}

export function outerOf(rc: RenderCtx, owner: string): string | null {
  const cls = rc.ctx.lookup(owner);
  const ic = cls?.innerClasses.find((x) => x.inner === owner);
  if (ic?.outer) return ic.outer;
  return cls?.enclosing?.class ?? null;
}
