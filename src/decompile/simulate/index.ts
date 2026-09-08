import { sameValue } from './equality.js';
import { runWorklist } from './worklist.js';
import { SimFail, type Terminator, type SimResult } from './result.js';
import { expressionType } from '../../ast/types.js';
import { Expr, Stmt } from '../../ast/ast.js';
import { Instr } from '../../bytecode/decode.js';
import type { Block, CFG } from '../../bytecode/cfg.js';
import type { ClassFile, MethodInfo } from '../../classfile/model.js';
import { JType, parseMethodDescriptor } from '../../classfile/types.js';
import { Ctx } from '../context.js';
import { ExprStack, exprIdent } from './stack.js';
import { isTermOp, PRIM_BOOL } from './helpers.js';
import { opsPart } from './ops.js';
import { indyPart } from './indy.js';
import { condPart } from './cond.js';

export { ExprStack } from './stack.js';
export { safeMethodDesc } from './helpers.js';

export { SimFail, type Terminator, type SimResult } from './result.js';

export class Simulator {
  readonly sim: SimResult;
  entryStack: ExprStack[] = [];
  private entrySet: boolean[];
  private stackOut: (ExprStack | null)[];
  private fixedTargets = new Set<number>();
  private entryProviders = new Map<number, number>();
  private blockSnapshots = new Map<number, unknown>();
  private mergeBindings = new Map<string, { target: number; position: number; local: Expr }>();
  readonly isStatic: boolean;
  lastLoad: import('../../ast/ast.js').Expr | null = null;
  pendingPrefix: { slot: number; op: '++x' | '--x' } | null = null;
  arrayInitCache = new Map<number, import('../../ast/ast.js').Expr>();

  private constructor(
    readonly ctx: Ctx,
    readonly cls: ClassFile,
    readonly method: MethodInfo,
    readonly cfg: CFG,
    private nextTempSlot: number,
  ) {
    this.sim = {
      stmts: cfg.blocks.map(() => []),
      terms: cfg.blocks.map(() => ({ t: 'none' }) as Terminator),
      entryStack: cfg.blocks.map(() => new ExprStack()),
      slotAssignPc: new Map(),
      switchSubjects: new Map(),
      switchCaseTypes: new Map(),
      nextTempSlot,
    };
    this.entryStack = cfg.blocks.map(() => new ExprStack());
    this.entrySet = new Array(cfg.blocks.length).fill(false);
    this.stackOut = cfg.blocks.map(() => null);
    this.entrySet[cfg.entry] = true;
    this.isStatic = (method.access & 0x0008) !== 0;
    for (const ex of method.code?.exceptions ?? []) {
      const bid = this.blockOf(ex.handlerPc);
      if (bid >= 0 && !this.entrySet[bid]) {
        const s = new ExprStack();
        const ct: JType = ex.catchType
          ? { kind: 'class', name: ex.catchType }
          : { kind: 'class', name: 'java/lang/Throwable' };
        s.push({ kind: 'raw', text: '@exception', jtype: ct });
        this.entryStack[bid] = s;
        this.entrySet[bid] = true;
      }
    }
  }

  static run(ctx: Ctx, cls: ClassFile, method: MethodInfo, cfg: CFG, maxLocals: number): SimResult {
    const s = new Simulator(ctx, cls, method, cfg, maxLocals + 1000);
    try {
      s.runAll();
      return s.sim;
    } catch (e) {
      if (e instanceof SimFail) {
        s.sim.failed = e.message;
        return s.sim;
      }
      throw e;
    }
  }

  private temporarySlots = new Map<string, number>();

  snapshotDuplicates(ins: Instr, stack: ExprStack, stmts: Stmt[]): void {
    const count = ins.op >= 0x5c && !stack.peek().w ? 2 : 1;
    const needsSnapshot = (e: Expr): boolean =>
      ![
        'const',
        'local',
        'this',
        'super',
        'new-uninit',
        'new-array',
        'sb-chain',
        'class-literal',
      ].includes(e.kind);
    if (!stack.items.slice(-count).some((item) => needsSnapshot(item.e))) return;

    const replacements = new Map<Expr, Expr>();
    for (let i = 0; i < stack.items.length; i++) {
      const item = stack.items[i];
      if (!needsSnapshot(item.e)) continue;
      const prior = replacements.get(item.e);
      if (prior) {
        item.e = prior;
        continue;
      }
      const key = `${ins.pc}:${i}`;
      let slot = this.temporarySlots.get(key);
      if (slot === undefined) {
        slot = this.nextTempSlot++;
        this.temporarySlots.set(key, slot);
        this.sim.nextTempSlot = this.nextTempSlot;
      }
      const jtype = expressionType(item.e);
      const local: Expr = { kind: 'local', slot, name: `dup${slot}`, jtype };
      if (jtype) this.ctx.recordSlotType(this.method, slot, jtype);
      stmts.push({ kind: 'expr', expr: { kind: 'assign-expr', target: local, expr: item.e } });
      replacements.set(item.e, local);
      item.e = local;
    }
  }

  preserveDiscarded(expr: Expr, pc: number, index: number, stmts: Stmt[], retain: boolean): Expr {
    if (
      ['const', 'this', 'super', 'new-uninit'].includes(expr.kind) ||
      (!retain && expr.kind === 'local')
    )
      return expr;
    if (
      !retain &&
      (expr.kind === 'invoke' ||
        expr.kind === 'new' ||
        expr.kind === 'assign-expr' ||
        (expr.kind === 'unary' && ['x++', 'x--', '++x', '--x'].includes(expr.op)))
    ) {
      stmts.push({ kind: 'expr', expr });
      return expr;
    }
    const key = `discard:${pc}:${index}`;
    let slot = this.temporarySlots.get(key);
    if (slot === undefined) {
      slot = this.nextTempSlot++;
      this.temporarySlots.set(key, slot);
      this.sim.nextTempSlot = this.nextTempSlot;
    }
    const jtype = expressionType(expr);
    if (jtype) this.ctx.recordSlotType(this.method, slot, jtype);
    const target = { kind: 'local' as const, slot, name: `discard${slot}`, jtype };
    stmts.push({ kind: 'expr', expr: { kind: 'assign-expr', target, expr } });
    return target;
  }

  blockOf(pc: number): number {
    if (pc < 0 || pc >= this.cfg.blockIndexAt.length) return -1;
    return this.cfg.blockIndexAt[pc];
  }

  private runAll(): void {
    let changes = 0;
    for (;;) {
      this.simulateAll();
      if (!this.fixupMerges()) break;
      const slots = this.entryStack.reduce((sum, stack) => sum + stack.depth, 0);
      if (++changes > this.cfg.blocks.length + slots + 1)
        throw new SimFail('stack merges did not converge');
    }
    for (const { target, position, local } of this.mergeBindings.values()) {
      for (const pred of this.cfg.blocks[target].preds) {
        const value = this.stackOut[pred]?.items[position]?.e;
        if (!value) continue;
        if (local.kind !== 'local') throw new SimFail('invalid merge variable');
        this.sim.stmts[pred].push({
          kind: 'expr',
          expr: { kind: 'assign-expr', target: local, expr: value },
        });
      }
    }
    this.sim.entryStack = this.entryStack;
  }

  private simulateAll(): void {
    runWorklist(
      this.cfg.rpo,
      (id) => {
        if (!this.entrySet[id]) return [];
        const revision = this.ctx.slotTypeRevision(this.method);
        const dirty = this.execBlock(id);
        const snapshot = [this.sim.stmts[id], this.sim.terms[id], this.stackOut[id]?.items];
        if (!sameValue(snapshot, this.blockSnapshots.get(id))) {
          this.blockSnapshots.set(id, structuredClone(snapshot));
          dirty.push(...this.cfg.blocks[id].succs);
        }
        if (revision !== this.ctx.slotTypeRevision(this.method)) dirty.push(...this.cfg.rpo);
        return dirty;
      },
      Math.max(256, this.cfg.blocks.length * 64),
    );
  }

  private execBlock(id: number): number[] {
    this.lastLoad = null;
    this.pendingPrefix = null;
    const b = this.cfg.blocks[id];
    const stack = this.entryStack[id].clone();
    const stmts: Stmt[] = [];
    this.sim.terms[id] = { t: 'none' };
    try {
      const last = b.instrs[b.instrs.length - 1];
      const endsWithTerm = isTermOp(last.op);
      const exec = endsWithTerm ? b.instrs.slice(0, -1) : b.instrs;
      for (let ii = 0; ii < exec.length; ii++) {
        this.execInstr(exec[ii], stack, stmts, b, ii < exec.length - 1 ? ii : undefined);
      }
    } catch (e) {
      if (e instanceof SimFail) throw e;
      throw new SimFail(`${(e as Error).message}`);
    }
    const term = this.makeTerminator(b, stack, id);
    this.sim.stmts[id] = stmts;
    this.sim.terms[id] = term;
    this.stackOut[id] = stack;
    const dirty: number[] = [];
    for (const successor of b.succs) {
      if (!this.entrySet[successor]) {
        this.entryProviders.set(successor, id);
        this.entrySet[successor] = true;
      } else if (this.fixedTargets.has(successor) || this.entryProviders.get(successor) !== id)
        continue;
      if (!sameValue(this.entryStack[successor].items, stack.items)) {
        this.entryStack[successor] = stack.clone();
        dirty.push(successor);
      } else if (!this.blockSnapshots.has(successor)) dirty.push(successor);
    }
    return dirty;
  }

  private fixupMerges(): boolean {
    let changed = false;
    for (const block of this.cfg.blocks) {
      const preds = block.preds.filter((pred) => this.stackOut[pred] !== null);
      if (preds.length <= 1) continue;
      const stacks = preds.map((pred) => this.stackOut[pred]!);
      const depth = stacks[0].depth;
      if (stacks.some((stack) => stack.depth !== depth))
        throw new SimFail('incompatible stack depths at merge');
      const entry = new ExprStack();
      for (let position = 0; position < depth; position++) {
        const wide = stacks[0].items[position].w;
        if (stacks.some((stack) => stack.items[position].w !== wide))
          throw new SimFail('incompatible stack widths at merge');
        const values = stacks.map((stack) => stack.items[position].e);
        const key = `${block.id}:${position}`;
        let binding = this.mergeBindings.get(key);
        if (!binding && values.every((value) => exprIdent(value, values[0]))) {
          entry.push(values[0], wide);
          continue;
        }
        if (!binding) {
          const slot = this.nextTempSlot++;
          this.sim.nextTempSlot = this.nextTempSlot;
          const jtype =
            (values[0] as { jtype?: JType }).jtype ??
            (values.every(
              (value) =>
                value.kind === 'const' &&
                value.ctype === 'int' &&
                (value.value === 0 || value.value === 1),
            )
              ? PRIM_BOOL
              : expressionType(values[0]));
          if (jtype) this.ctx.recordSlotType(this.method, slot, jtype);
          binding = {
            target: block.id,
            position,
            local: { kind: 'local', slot, name: `r${slot}`, jtype },
          };
          this.mergeBindings.set(key, binding);
          this.fixedTargets.add(block.id);
        }
        entry.push(binding.local, wide);
      }
      if (!sameValue(entry.items, this.entryStack[block.id].items)) {
        this.entryStack[block.id] = entry;
        changed = true;
      }
    }
    return changed;
  }

  private makeTerminator(b: Block, stack: ExprStack, id: number): Terminator {
    const last = b.instrs[b.instrs.length - 1];
    const op = last.op;
    if ((op >= 0x99 && op <= 0xa6) || op === 0xc6 || op === 0xc7) {
      const jumpB = this.blockOf(last.branch!);
      const cond = this.buildCond(last, stack);
      if (cond.kind === 'const' && cond.ctype === 'boolean') {
        return { t: 'goto', target: cond.value === true ? jumpB : b.fallthrough };
      }
      return { t: 'if', cond, jumpB, fallB: b.fallthrough };
    }
    if (op === 0xa7 || op === 0xc8) {
      return { t: 'goto', target: this.blockOf(last.branch!) };
    }
    if (op === 0xaa || op === 0xab) {
      const subject = stack.pop();
      this.sim.switchSubjects.set(id, subject);
      const cases: { value: number | null; target: number }[] = [];
      for (const c of last.switchCases ?? [])
        cases.push({ value: c.value, target: this.blockOf(c.target) });
      cases.push({ value: null, target: this.blockOf(last.switchDefault!) });
      return { t: 'switch', ins: last, cases };
    }
    if (op >= 0xac && op <= 0xb0) {
      let expr = stack.depth > 0 ? stack.pop() : undefined;
      if (expr && this.method.name !== '<clinit>') {
        const ret = parseMethodDescriptor(this.method.descriptor).ret;
        if (
          ret.kind === 'prim' &&
          ret.name === 'boolean' &&
          expr.kind === 'const' &&
          expr.ctype === 'int' &&
          (expr.value === 0 || expr.value === 1)
        ) {
          expr = { kind: 'const', ctype: 'boolean', value: expr.value === 1 };
        }
      }
      return { t: 'return', expr };
    }
    if (op === 0xb1) return { t: 'return' };
    if (op === 0xbf) return { t: 'throw', expr: stack.pop() };
    if (op === 0xa8 || op === 0xc9 || op === 0xa9) {
      throw new SimFail('jsr/ret unsupported');
    }
    return { t: 'none' };
  }
}

export interface Simulator {
  execInstr(ins: Instr, stack: ExprStack, stmts: Stmt[], b: Block, insIdx?: number): void;
  pushVoidCall(
    stmts: Stmt[],
    nm: string,
    ref: { owner: string; name: string; descriptor: string },
    target: import('../../ast/ast.js').Expr,
    args: import('../../ast/ast.js').Expr[],
    isSuper: boolean,
  ): void;
  classTypeAt(idx: number): JType;
  pushLoadConst(idx: number, stack: ExprStack, wide2?: boolean): void;
  localExpr(slot: number, pc: number): import('../../ast/ast.js').Expr;
  assignLocal(slot: number, v: import('../../ast/ast.js').Expr, pc: number): Stmt;
  buildNew(
    owner: string,
    args: import('../../ast/ast.js').Expr[],
    descriptor?: string,
  ): import('../../ast/ast.js').Expr;
  replaceUninit(
    stack: ExprStack,
    stmts: Stmt[],
    uid: number,
    replacement: import('../../ast/ast.js').Expr,
  ): void;
  tryArrayInit(
    b: Block,
    ins: Instr,
    elem: JType,
    len: import('../../ast/ast.js').Expr,
  ): { expr: import('../../ast/ast.js').Expr } | null;
  execInvokeDynamic(ins: Instr, stack: ExprStack, stmts: Stmt[]): void;
  bootstrapConstToExpr(
    c: { kind: string; value?: unknown } | undefined,
  ): import('../../ast/ast.js').Expr;
  buildCond(ins: Instr, stack: ExprStack): import('../../ast/ast.js').Expr;
  isBooleanish(e: import('../../ast/ast.js').Expr): boolean;
}

Object.assign(Simulator.prototype, opsPart, indyPart, condPart);
