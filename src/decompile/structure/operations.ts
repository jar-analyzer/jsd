import type { Stmt } from '../../ast/ast.js';
import type { LoopInfo, RangeGroup, WalkCtx, Breakable } from './types.js';

export interface StructureOperations {
  tryBoolValueRegion(
    entry: number,
  ): { expr: import('../../ast/ast.js').Expr; slot: number; name: string } | null;
  resolveIf(
    b: number,
    nodes: Set<number>,
  ): {
    condT: import('../../ast/ast.js').Expr;
    T: number;
    condE: import('../../ast/ast.js').Expr;
    E: number;
  };
  canAbsorb(blk: number, from: number, nodes: Set<number>): boolean;
  emitIf(b: number, nodes: Set<number>, follow: Set<number>, wctx: WalkCtx, stmts: Stmt[]): number;
  tryTernaryValue(
    b: number,
    T: number,
    E: number,
    condT: import('../../ast/ast.js').Expr,
  ): Stmt | null;
  terminatingArm(target: number, wctx: WalkCtx): Stmt[] | undefined;
  handleSwitch(
    b: number,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
    stmts: Stmt[],
  ): number;
  caseBody(
    target: number,
    nodes: Set<number>,
    followPlus: Set<number>,
    laterCaseTargets: Set<number>,
    wctx: WalkCtx,
  ): Stmt[];
  tryStringSwitch(
    b: number,
    subject: import('../../ast/ast.js').Expr,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
  ): { stmt: Stmt; next: number } | null;
  tryEnumSwitch(
    b: number,
    subject: import('../../ast/ast.js').Expr,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
  ): { stmt: Stmt; next: number } | null;
  buildEnumSwitchMap(
    ownerCls: import('../../classfile/model.js').ClassFile,
    mapName: string,
    enumCls: string,
  ): Map<number, string> | null;
  handleLoop(
    loop: LoopInfo,
    enterAt: number,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
    stmts: Stmt[],
  ): number;
  makeLoopBreakable(
    stmt: Stmt,
    exits: Set<number>,
    continueTargets: number[],
    naturalExit: number,
  ): Breakable;
  loopAfter(
    header: number,
    ifT: { jumpB: number; fallB: number },
    nodes: Set<number>,
    loopNodes: Set<number>,
    exitSet: Set<number>,
    fallback: number,
  ): number;
  recoverFor(
    header: number,
    backSrc: number,
    body: Stmt[],
    cond: import('../../ast/ast.js').Expr,
    outerStmts: Stmt[],
    _wctx: WalkCtx,
  ): { stmt: Stmt; preStmts: Stmt[] } | null;
  handleTry(
    group: RangeGroup,
    entryBlock: number,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
    stmts: Stmt[],
  ): number;
  detectMatchGuard(group: RangeGroup): boolean;
  consumeGroup(group: RangeGroup, nodes: Set<number>): void;
  handlerChain(hb: number): { stmts: Stmt[]; endBlock: number } | null;
  mergeSequentialRanges(group: RangeGroup): void;
  detectSync(group: RangeGroup, outerStmts?: Stmt[]): boolean;
  detectFinally(group: RangeGroup): boolean;
  walkFinallyRegion(hb: number, exSlot: number): Stmt[] | null;
}
