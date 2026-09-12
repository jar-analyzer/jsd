import { expressionType } from '../../ast/types.js';
import { walkExpr, walkStmt, walkStmtExprs, type Expr, type Stmt } from '../../ast/ast.js';
import type { JType } from '../../classfile/types.js';
import { hasTypeAnnotations } from '../type-annotations.js';
import { localUses } from './local-uses.js';

function sameType(a: JType | undefined, b: JType | undefined): boolean {
  return (
    !!a &&
    !!b &&
    !hasTypeAnnotations(a) &&
    !hasTypeAnnotations(b) &&
    JSON.stringify(a) === JSON.stringify(b)
  );
}

function visitValues(expr: Expr, visit: (expr: Expr) => void): void {
  walkExpr(expr, (value) => {
    visit(value);
    if (value.kind === 'assign-expr') {
      const target = value.target;
      if (target.kind === 'field' && target.target) visitValues(target.target, visit);
      if (target.kind === 'array') {
        visitValues(target.array, visit);
        visitValues(target.index, visit);
      }
    }
    if (value.kind === 'monitor') visitValues(value.expr, visit);
  });
}

function replaceValue(expr: Expr, slot: number, value: Expr, firstOnly: boolean): Expr {
  if (expr.kind === 'local') return expr.slot === slot ? value : expr;
  const next = (child: Expr) => replaceValue(child, slot, value, firstOnly);
  switch (expr.kind) {
    case 'binary':
      return { ...expr, left: next(expr.left), right: firstOnly ? expr.right : next(expr.right) };
    case 'unary':
      return ['+', '-', '~', '!'].includes(expr.op)
        ? { ...expr, operand: next(expr.operand) }
        : expr;
    case 'cast':
    case 'instanceof':
      return { ...expr, expr: next(expr.expr) };
    case 'bool':
      return { ...expr, inner: next(expr.inner) };
    case 'field-get':
      return expr.target ? { ...expr, target: next(expr.target) } : expr;
    case 'array-length':
      return { ...expr, array: next(expr.array) };
    case 'array-load':
      return { ...expr, array: next(expr.array), index: firstOnly ? expr.index : next(expr.index) };
    case 'invoke':
      if (expr.name === '<init>' || expr.bootstrap) return expr;
      return {
        ...expr,
        target: expr.target ? next(expr.target) : undefined,
        args: expr.args.map((arg, index) =>
          !firstOnly || (!expr.target && index === 0) ? next(arg) : arg,
        ),
      };
    case 'assign-expr': {
      if (expr.op) return expr;
      const target = expr.target;
      if (target.kind === 'local') return { ...expr, expr: next(expr.expr) };
      if (target.kind === 'field')
        return {
          ...expr,
          target: { ...target, target: target.target ? next(target.target) : undefined },
          expr: !firstOnly || !target.target ? next(expr.expr) : expr.expr,
        };
      return {
        ...expr,
        target: {
          ...target,
          array: next(target.array),
          index: firstOnly ? target.index : next(target.index),
        },
        expr: firstOnly ? expr.expr : next(expr.expr),
      };
    }
    case 'ternary':
      return {
        ...expr,
        cond: next(expr.cond),
        thenE: firstOnly ? expr.thenE : next(expr.thenE),
        elseE: firstOnly ? expr.elseE : next(expr.elseE),
      };
    case 'new':
      return expr;
    case 'new-array':
      return firstOnly ? expr : { ...expr, dimsExprs: expr.dimsExprs.map(next) };
    case 'array-init':
      return firstOnly ? expr : { ...expr, values: expr.values.map(next) };
    case 'concat':
      return firstOnly ? expr : { ...expr, parts: expr.parts.map(next) };
    case 'method-ref':
      return expr;
    default:
      return expr;
  }
}

function bodies(stmt: Stmt): Stmt[][] {
  switch (stmt.kind) {
    case 'if':
      return [stmt.thenS, ...(stmt.elseS ? [stmt.elseS] : [])];
    case 'while':
    case 'do-while':
    case 'for':
    case 'foreach':
    case 'sync':
      return [stmt.body];
    case 'switch':
      return stmt.cases.map((arm) => arm.body);
    case 'try':
      return [
        stmt.body,
        ...stmt.catches.map((handler) => handler.body),
        ...(stmt.finallyS ? [stmt.finallyS] : []),
      ];
    default:
      return [];
  }
}

export function simplifySyntheticLocals(
  stmts: Stmt[],
  check: (cost: number) => void = () => {},
): Stmt[] {
  let opaque = false;
  let hasTemporary = false;
  const inspect = (expr: Expr): void => {
    check(1);
    if (expr.kind === 'assign-expr' && expr.target.kind === 'local' && expr.target.temporary)
      hasTemporary = true;
    if (['lambda', 'raw', 'monitor', 'new-uninit', 'sb-chain'].includes(expr.kind)) opaque = true;
  };
  for (const stmt of stmts) {
    walkStmtExprs(stmt, (expr) => {
      inspect(expr);
      if (expr.kind === 'assign-expr') {
        const target = expr.target;
        if (target.kind === 'field' && target.target) visitValues(target.target, inspect);
        if (target.kind === 'array') {
          visitValues(target.array, inspect);
          visitValues(target.index, inspect);
        }
      }
    });
    walkStmt(stmt, (child) => {
      check(1);
      if (child.kind === 'bad') opaque = true;
      if (child.kind === 'try')
        for (const resource of child.resources ?? [])
          if (resource.init) visitValues(resource.init, inspect);
    });
  }
  if (opaque || !hasTemporary) return stmts;
  const out = structuredClone(stmts);
  let changed = false;
  for (;;) {
    const uses = localUses(out, check);
    const rewrite = (list: Stmt[]): boolean => {
      for (let i = 0; i < list.length; i++) {
        check(1);
        const stmt = list[i];
        if (stmt.kind === 'expr' && stmt.expr.kind === 'assign-expr') {
          const assignment = stmt.expr;
          const target = assignment.target;
          const value = assignment.expr;
          if (
            !assignment.op &&
            target.kind === 'local' &&
            target.temporary &&
            sameType(target.jtype, expressionType(value)) &&
            !(target.jtype?.kind === 'prim' && ['float', 'double'].includes(target.jtype.name))
          ) {
            const use = uses.get(target.slot);
            if (
              use?.writes === 1 &&
              use.reads === 0 &&
              value.kind === 'invoke' &&
              value.name !== '<init>' &&
              !value.bootstrap
            ) {
              list[i] = { kind: 'expr', expr: value };
              return true;
            }
            if (use?.writes === 1 && use.reads === 1) {
              const copy = value.kind === 'local';
              for (let j = i + 1; j < list.length; j++) {
                check(1);
                const consumer = list[j];
                if (!['expr', 'return', 'throw'].includes(consumer.kind)) break;
                const reads = localUses([consumer], check);
                if (copy && reads.get(value.slot)?.writes) break;
                if (reads.get(target.slot)?.reads) {
                  if (
                    consumer.kind !== 'expr' &&
                    consumer.kind !== 'return' &&
                    consumer.kind !== 'throw'
                  )
                    break;
                  if (!consumer.expr) break;
                  let matchingType = true;
                  visitValues(consumer.expr, (expr) => {
                    check(1);
                    if (
                      expr.kind === 'local' &&
                      expr.slot === target.slot &&
                      !sameType(target.jtype, expr.jtype)
                    )
                      matchingType = false;
                  });
                  if (!matchingType) break;
                  const replacementValue: Expr =
                    target.jtype?.kind === 'class' || target.jtype?.kind === 'array'
                      ? { kind: 'cast', jtype: target.jtype, expr: value }
                      : value;
                  const expr = replaceValue(consumer.expr, target.slot, replacementValue, !copy);
                  const replacement: Stmt = { ...consumer, expr };
                  if (localUses([replacement], check).get(target.slot)?.reads) break;
                  list[j] = replacement;
                  list.splice(i, 1);
                  return true;
                }
                if (!copy || consumer.kind !== 'expr') break;
              }
            }
          }
        }
        for (const body of bodies(stmt)) if (rewrite(body)) return true;
      }
      return false;
    };
    if (!rewrite(out)) return changed ? out : stmts;
    changed = true;
  }
}
