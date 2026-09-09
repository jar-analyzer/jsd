import { walkExpr, walkStmt, walkStmtExprs, type Expr, type Stmt } from '../../ast/ast.js';

export function localUses(stmts: Stmt[]): Map<number, { reads: number; writes: number }> {
  const uses = new Map<number, { reads: number; writes: number }>();
  const at = (slot: number) => {
    let use = uses.get(slot);
    if (!use) uses.set(slot, (use = { reads: 0, writes: 0 }));
    return use;
  };
  const expression = (e: Expr): void => {
    if (e.kind === 'local') at(e.slot).reads++;
    if (e.kind === 'assign-expr') {
      const t = e.target;
      if (t.kind === 'local') {
        at(t.slot).writes++;
        if (e.op) at(t.slot).reads++;
      } else if (t.kind === 'field') {
        if (t.target) walkExpr(t.target, expression);
      } else {
        walkExpr(t.array, expression);
        walkExpr(t.index, expression);
      }
    }
    if (
      e.kind === 'unary' &&
      ['x++', 'x--', '++x', '--x'].includes(e.op) &&
      e.operand.kind === 'local'
    )
      at(e.operand.slot).writes++;
    if (e.kind === 'monitor') walkExpr(e.expr, expression);
    if (e.kind === 'lambda') {
      visit(e.body);
      if (e.exprBody) walkExpr(e.exprBody, expression);
    }
  };
  const visit = (list: Stmt[]): void => {
    for (const s of list) {
      walkStmtExprs(s, expression);
      walkStmt(s, (st) => {
        if (st.kind === 'local-decl' && st.slot !== undefined) at(st.slot).writes++;
        if (st.kind === 'foreach' && st.varSlot !== undefined) at(st.varSlot).writes++;
        if (st.kind === 'try') {
          for (const c of st.catches) if (c.varSlot !== undefined) at(c.varSlot).writes++;
          for (const r of st.resources ?? []) {
            at(r.slot).writes++;
            at(r.slot).reads++;
            if (r.init) walkExpr(r.init, expression);
          }
        }
      });
    }
  };
  visit(stmts);
  return uses;
}
