import type { Stmt } from '../../ast/ast.js';
import type { Structurer } from './index.js';
import type { RangeGroup, RecoveredStatement, WalkCtx } from './types.js';
import { attemptRecognition } from './recognition.js';
import { detectTwr } from './twr.js';
import { detectTwr8 } from './twr8.js';
import { detectTwr9 } from './twr9.js';

export function recoverResources(
  state: Structurer,
  group: RangeGroup,
  nodes: Set<number>,
  stmts: Stmt[],
  wctx: WalkCtx,
): RecoveredStatement | null {
  if (
    !state.rangeGroups.some(
      (g) =>
        g.start >= group.start &&
        g.end <= group.end &&
        g.handlers.some((h) => h.catchType === 'java/lang/Throwable'),
    )
  )
    return null;
  const candidates = [
    () => detectTwr(state, group, nodes, stmts),
    () => detectTwr9(state, group, nodes, stmts, wctx),
    () => detectTwr8(state, group, nodes, stmts, wctx),
  ];
  for (const recognize of candidates) {
    const result = attemptRecognition(state, [group, nodes, stmts, wctx], recognize);
    if (result) return result;
  }
  return null;
}
