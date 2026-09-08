import { Expr, Stmt, walkStmtExprs } from '../../ast/ast.js';
import { transformChildren } from './index.js';
import type { BoolFoldCtx } from './index.js';
import {
  ternaryToBool,
  intTernaryToBool,
  firstReadExpectsBoolean,
  replaceFirstRead,
} from './ternary.js';

export function propagateTemps(stmts: Stmt[], bctx?: BoolFoldCtx): Stmt[] {
  const defs = new Map<number, { list: Stmt[]; idx: number; expr: Expr; name: string }>();
  const uses = new Map<number, number>();
  const walkList = (list: Stmt[]): void => {
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (
        st.kind === 'expr' &&
        st.expr.kind === 'assign-expr' &&
        st.expr.target.kind === 'local' &&
        !st.expr.op
      ) {
        const slot = (st.expr.target as { slot: number }).slot;
        const name = (st.expr.target as { name: string }).name;
        if (/^r\d+$/.test(name) && !defs.has(slot)) {
          defs.set(slot, { list, idx: i, expr: st.expr.expr, name });
        } else if (defs.has(slot)) {
          defs.delete(slot);
        }
      }
      walkStmtExprs(st, (e) => {
        if (e.kind === 'local' && /^r\d+$/.test(e.name)) {
          uses.set(e.slot, (uses.get(e.slot) ?? 0) + 1);
        }
      });
    }
  };
  walkList(stmts);
  let changed = false;
  for (const [slot, def] of defs) {
    const useCount = uses.get(slot) ?? 0;
    if (useCount !== 1) continue;
    def.list.splice(def.idx, 1);
    let repl = def.expr;
    if (bctx && repl.kind === 'ternary') {
      const asBool = intTernaryToBool(repl);
      if (asBool && firstReadExpectsBoolean(stmts, slot, bctx)) repl = asBool;
    }
    const replaced = replaceFirstRead(stmts, slot, repl);
    if (replaced) return replaced;
    changed = true;
    break;
  }
  return changed ? stmts : stmts;
}

export function foldBoolTernary(stmts: Stmt[]): Stmt[] {
  const out: Stmt[] = [];
  for (const s of stmts) {
    transformChildren(s, foldBoolTernary);
    if (s.kind === 'expr' && s.expr.kind === 'ternary') {
      const b = ternaryToBool(s.expr);
      if (b) {
        out.push({ kind: 'expr', expr: b });
        continue;
      }
    }
    out.push(s);
  }
  return out;
}
