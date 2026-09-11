import { walkStmtExprs, walkStmt, walkExpr, type Expr, type Stmt } from '../ast/ast.js';
import { expressionType } from '../ast/types.js';
import type { MethodInfo } from '../classfile/model.js';
import { parseMethodDescriptor, type JType } from '../classfile/types.js';
import type { Ctx } from './context.js';

export function recoverLocalTypes(ctx: Ctx, method: MethodInfo, stmts: Stmt[]): void {
  if (method.code?.localVars.length) return;
  const expressions = new Set<Expr>();
  for (const stmt of stmts)
    walkStmtExprs(stmt, (e) => {
      expressions.add(e);
      if (e.kind === 'assign-expr') {
        if (e.target.kind === 'array') {
          walkExpr(e.target.array, (e) => expressions.add(e));
          walkExpr(e.target.index, (e) => expressions.add(e));
        } else if (e.target.kind === 'field' && e.target.target) {
          walkExpr(e.target.target, (e) => expressions.add(e));
        }
      }
    });
  const constraints = new Map<number, JType>();
  const copies: [number, number][] = [];
  const requireType = (expr: Expr, type: JType | undefined, force = false): void => {
    if (
      expr.kind !== 'local' ||
      !type ||
      type.kind === 'prim' ||
      (type.kind === 'class' && type.name === 'java/lang/Object')
    )
      return;
    const known = expressionType(expr);
    if (!force && known && !(known.kind === 'class' && known.name === 'java/lang/Object')) return;
    const old = constraints.get(expr.slot);
    if (!old || JSON.stringify(old) === JSON.stringify(type)) constraints.set(expr.slot, type);
    else if (
      old.kind === 'array' &&
      type.kind === 'array' &&
      old.elem.kind !== 'prim' &&
      type.elem.kind !== 'prim'
    )
      constraints.set(expr.slot, {
        kind: 'array',
        elem: { kind: 'class', name: 'java/lang/Object' },
      });
  };
  for (const expr of expressions) {
    if (expr.kind === 'invoke') {
      const signature = parseMethodDescriptor(expr.descriptor);
      if (expr.target && expr.name !== '<init>') {
        const actual = expressionType(expr.target);
        const bridge =
          actual?.kind === 'class' &&
          actual.name !== expr.owner &&
          ctx
            .lookup(actual.name)
            ?.methods.some(
              (m) =>
                m.access & 0x40 &&
                m.name === expr.name &&
                m.descriptor === expr.descriptor &&
                signature.params.length > 0,
            );
        requireType(expr.target, { kind: 'class', name: expr.owner }, !!bridge);
      }
      expr.args.forEach((arg, i) => requireType(arg, signature.params[i]));
    } else if (expr.kind === 'field-get' && expr.target) {
      requireType(expr.target, { kind: 'class', name: expr.owner });
    } else if (expr.kind === 'array-load') {
      requireType(
        expr.array,
        expressionType(expr.array) ?? {
          kind: 'array',
          elem: expr.jtype ?? { kind: 'class', name: 'java/lang/Object' },
        },
      );
    } else if (expr.kind === 'assign-expr') {
      const target = expr.target;
      if (target.kind === 'local' && expr.expr.kind === 'local')
        copies.push([target.slot, expr.expr.slot]);
      if (target.kind === 'array') {
        const value = expressionType(expr.expr);
        const array = expressionType(target.array);
        const elem = array?.kind === 'array' ? array.elem : value;
        requireType(
          target.array,
          {
            kind: 'array',
            elem:
              elem?.kind === 'prim'
                ? elem
                : (value ?? elem ?? { kind: 'class', name: 'java/lang/Object' }),
          },
          array?.kind === 'array' &&
            elem?.kind !== 'prim' &&
            value?.kind === 'class' &&
            value.name === 'java/lang/Object',
        );
      } else if (target.kind === 'field' && target.target) {
        requireType(target.target, { kind: 'class', name: target.owner });
      }
    }
  }
  for (let round = 0; round <= copies.length; round++) {
    let changed = false;
    for (const [a, b] of copies) {
      if (!constraints.has(a) && constraints.has(b)) {
        constraints.set(a, constraints.get(b)!);
        changed = true;
      }
      if (!constraints.has(b) && constraints.has(a)) {
        constraints.set(b, constraints.get(a)!);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const expr of expressions) {
    if (expr.kind === 'local' && constraints.has(expr.slot))
      expr.jtype = constraints.get(expr.slot);
    if (
      expr.kind === 'assign-expr' &&
      expr.target.kind === 'local' &&
      constraints.has(expr.target.slot)
    )
      expr.target.jtype = constraints.get(expr.target.slot);
  }
  for (const stmt of stmts)
    walkStmt(stmt, (s) => {
      if (s.kind === 'local-decl' && s.slot !== undefined && constraints.has(s.slot))
        s.jtype = constraints.get(s.slot)!;
    });
}
