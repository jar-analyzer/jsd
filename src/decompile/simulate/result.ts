import type { Stmt } from '../../ast/ast.js';
import type { Instr } from '../../bytecode/decode.js';
import type { ExprStack } from './stack.js';

export class SimFail extends Error {}

export type Terminator =
  | { t: 'none' }
  | { t: 'if'; cond: import('../../ast/ast.js').Expr; jumpB: number; fallB: number }
  | { t: 'goto'; target: number }
  | { t: 'switch'; ins: Instr; cases: { value: number | null; target: number }[] }
  | { t: 'return'; expr?: import('../../ast/ast.js').Expr }
  | { t: 'throw'; expr: import('../../ast/ast.js').Expr }
  | { t: 'athrow' };

export type SwitchLabel = { kind: 'type' | 'constant'; text: string };

export interface SimResult {
  stmts: Stmt[][];
  terms: Terminator[];
  entryStack: ExprStack[];
  slotAssignPc: Map<number, number[]>;
  switchSubjects: Map<number, import('../../ast/ast.js').Expr>;
  switchCaseTypes: Map<number, SwitchLabel[]>;
  nextTempSlot: number;
  failed?: string;
}
