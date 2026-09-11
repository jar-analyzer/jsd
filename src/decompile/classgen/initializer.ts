import { walkStmt, type Stmt } from '../../ast/ast.js';
import { renderStmts, type RenderCtx } from '../printer/index.js';

export function renderInitializer(stmts: Stmt[], rc: RenderCtx, isStatic: boolean): string[] {
  const body = structuredClone(stmts);
  const labels = new Set<string>();
  let hasReturn = false;
  for (const stmt of body)
    walkStmt(stmt, (node) => {
      if ('label' in node && node.label) labels.add(node.label);
      if (node.kind === 'return') hasReturn = true;
    });
  const opening = isStatic ? 'static {' : '{';
  if (!hasReturn) return ['', opening, ...renderStmts(body, rc, 1), '}'];
  let label = 'initialize';
  while (labels.has(label)) label += '$';
  for (const stmt of body)
    walkStmt(stmt, (node) => {
      if (node.kind === 'return') Object.assign(node, { kind: 'break', label });
    });
  return ['', opening, `    ${label}: {`, ...renderStmts(body, rc, 2), '    }', '}'];
}
