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
