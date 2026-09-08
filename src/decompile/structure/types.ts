import { Expr, Stmt } from '../../ast/ast.js';
import type { ExceptionEntry } from '../../classfile/model.js';

export class StructFail extends Error {}

export interface LoopInfo {
  header: number;
  blocks: Set<number>;
  backSrcs: number[];
}

export class RangeGroup {
  consumedHandlers = new Set<number>();
  done = false;
  isSync = false;
  monitorSlot?: number;
  monitorExpr?: Expr;
  finallyBody?: Stmt[];
  constructor(
    public start: number,
    public end: number,
    public handlers: ExceptionEntry[],
  ) {}
}

export interface Breakable {
  kind: 'loop' | 'switch';
  exits: Set<number>;
  naturalExit: number;
  continueTargets?: Set<number>;
  updateBlocks?: Set<number>;
  label?: string;
  stmt: { label?: string };
}

export interface WalkCtx {
  implicitEnds: Set<string>;
  breakables: Breakable[];
}

export interface StructureOutput {
  stmts: Stmt[];
  failed?: string;
}

export interface RecoveredStatement {
  stmt: Stmt;
  next: number;
}
