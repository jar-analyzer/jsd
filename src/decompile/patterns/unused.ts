import { walkStmt, walkStmtExprs, type Expr, type Stmt } from '../../ast/ast.js';
import { transformChildren } from './hoist.js';
import { localUses } from './local-uses.js';

function discardable(e: Expr): boolean {
  return (
    e.kind === 'local' ||
    e.kind === 'this' ||
    (e.kind === 'const' &&
      ['int', 'long', 'float', 'double', 'boolean', 'char', 'string', 'null'].includes(e.ctype))
  );
}

export function removeUnusedLocals(stmts: Stmt[]): Stmt[] {
  let opaque = false;
  for (const s of stmts) {
    walkStmt(s, (st) => {
      if (st.kind === 'bad') opaque = true;
    });
    walkStmtExprs(s, (e) => {
      if (e.kind === 'raw' || e.kind === 'lambda') opaque = true;
    });
  }
  if (opaque) return stmts;
  const uses = localUses(stmts);
  let changed = false;
  const clean = (list: Stmt[]): Stmt[] => {
    const out: Stmt[] = [];
    for (const s of list) {
      transformChildren(s, clean);
      if (s.kind === 'label' && s.inner.kind !== 'expr') s.inner = clean([s.inner])[0];
      if (
        s.kind === 'expr' &&
        s.expr.kind === 'assign-expr' &&
        !s.expr.op &&
        s.expr.target.kind === 'local' &&
        !uses.get(s.expr.target.slot)?.reads &&
        discardable(s.expr.expr)
      ) {
        changed = true;
        continue;
      }
      const prev = out[out.length - 1];
      if (
        s.kind === 'switch' &&
        s.stringMode &&
        s.subject.kind === 'local' &&
        prev?.kind === 'expr' &&
        prev.expr.kind === 'assign-expr' &&
        !prev.expr.op &&
        prev.expr.target.kind === 'local' &&
        prev.expr.target.slot === s.subject.slot
      ) {
        const use = uses.get(s.subject.slot);
        if (use?.reads === 1 && use.writes === 1) {
          s.subject = prev.expr.expr;
          out.pop();
          changed = true;
        }
      }
      out.push(s);
    }
    return out;
  };
  const out = clean(stmts);
  return changed ? out : stmts;
}
