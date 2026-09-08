import { Stmt } from '../../ast/ast.js';
import { transformChildren } from './index.js';
import { ternaryToBool, countSlotUses, replaceFirstRead } from './ternary.js';

export function propagateTemps(stmts: Stmt[]): Stmt[] {
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    if (stmt.kind !== 'expr' || stmt.expr.kind !== 'assign-expr') continue;
    const assignment = stmt.expr;
    if (
      assignment.op ||
      assignment.target.kind !== 'local' ||
      !assignment.target.temporary ||
      assignment.expr.kind !== 'const'
    )
      continue;
    const uses = countSlotUses(stmts, assignment.target.slot);
    if (uses.writes !== 1 || uses.reads !== 1) continue;
    const rest = structuredClone(stmts.slice(i + 1));
    const replaced = replaceFirstRead(rest, assignment.target.slot, assignment.expr);
    if (replaced) return [...stmts.slice(0, i), ...replaced];
  }
  return stmts;
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
