import {
  bootstrapConstant,
  dynamicConstant,
  methodTypeExpression,
  ConstantResolutionError,
} from './constants.js';
import { errorMessage } from '../diagnostics.js';
import { discardOperands } from './discard.js';
import { canConcatenateBuilder, concatAppendArgument } from './string-builder.js';
import { expressionType } from '../../ast/types.js';
import { BinOp, Expr, Stmt } from '../../ast/ast.js';
import { Instr } from '../../bytecode/decode.js';
import type { Block } from '../../bytecode/cfg.js';
import { ATYPE_NAMES } from '../../classfile/opcodes.js';
import { JType, parseFieldDescriptor, parseMethodDescriptor } from '../../classfile/types.js';
import { SimFail, ExprStack } from './index.js';
import {
  replaceInStmt,
  opcodeSlot,
  intConstOf,
  isPrimChar,
  primOf,
  arithType,
  isSuperOwner,
  isLoadOp,
  isWideRet,
  constType,
  PRIM_INT,
  STR,
} from './helpers.js';
import type { Simulator } from './index.js';

export const opsPart: ThisType<Simulator> &
  Pick<
    Simulator,
    | 'execInstr'
    | 'pushVoidCall'
    | 'classTypeAt'
    | 'pushLoadConst'
    | 'localExpr'
    | 'assignLocal'
    | 'buildNew'
    | 'replaceUninit'
    | 'tryArrayInit'
  > = {
  execInstr(ins: Instr, stack: ExprStack, stmts: Stmt[], b: Block, insIdx?: number): void {
    const cp = this.cls.cp;
    const op = ins.op;
    const nm = ins.name;
    if (
      op === 0xa8 ||
      op === 0xa9 ||
      op === 0xc9 ||
      nm.startsWith('wide ret') ||
      nm.startsWith('wide jsr')
    ) {
      throw new SimFail('jsr/ret unsupported');
    }
    if (op === 0x00) return;
    if (op === 0x01) {
      stack.push({ kind: 'const', ctype: 'null', value: undefined });
      return;
    }
    if (op >= 0x02 && op <= 0x08) {
      stack.push(intConstOf(op - 0x03));
      return;
    }
    if (op === 0x09 || op === 0x0a) {
      stack.push({ kind: 'const', ctype: 'long', value: BigInt(op - 0x09) }, true);
      return;
    }
    if (op >= 0x0b && op <= 0x0d) {
      stack.push({ kind: 'const', ctype: 'float', value: op - 0x0b });
      return;
    }
    if (op === 0x0e || op === 0x0f) {
      stack.push({ kind: 'const', ctype: 'double', value: op - 0x0e }, true);
      return;
    }
    if (op === 0x10 || op === 0x11) {
      stack.push(intConstOf(ins.imm!));
      return;
    }
    if (op === 0x12 || op === 0x13) {
      this.pushLoadConst(ins.cpIndex!, stack, false, ins.pc);
      return;
    }
    if (op === 0x14) {
      this.pushLoadConst(ins.cpIndex!, stack, true, ins.pc);
      return;
    }
    if (
      nm.startsWith('iload') ||
      nm.startsWith('lload') ||
      nm.startsWith('fload') ||
      nm.startsWith('dload') ||
      nm.startsWith('aload')
    ) {
      const slot = ins.local ?? opcodeSlot(nm);
      const wide = nm.startsWith('lload') || nm.startsWith('dload');
      if (this.pendingPrefix && this.pendingPrefix.slot === slot) {
        const op = this.pendingPrefix.op;
        this.pendingPrefix = null;
        this.lastLoad = null;
        stack.push({ kind: 'unary', op, operand: this.localExpr(slot, ins.pc) }, wide);
        return;
      }
      const e = this.localExpr(slot, ins.pc);
      this.lastLoad = e;
      stack.push(e, wide);
      return;
    }
    const arrLoad: Record<string, string | undefined> = {
      iaload: 'int',
      laload: 'long',
      faload: 'float',
      daload: 'double',
      aaload: undefined,
      baload: 'int',
      caload: 'char',
      saload: 'int',
    };
    if (nm in arrLoad) {
      const idx = stack.pop(),
        arr = stack.pop();
      const prim = arrLoad[nm];
      const jtype: JType | undefined = prim ? { kind: 'prim', name: prim as 'int' } : undefined;
      stack.push(
        { kind: 'array-load', array: arr, index: idx, jtype },
        nm === 'laload' || nm === 'daload',
      );
      return;
    }
    if (
      nm.startsWith('istore') ||
      nm.startsWith('lstore') ||
      nm.startsWith('fstore') ||
      nm.startsWith('dstore') ||
      nm.startsWith('astore')
    ) {
      const slot = ins.local ?? opcodeSlot(nm);
      const v = stack.pop();
      stmts.push(this.assignLocal(slot, v, ins.pc));
      return;
    }
    if (
      [
        'iastore',
        'lastore',
        'fastore',
        'dastore',
        'aastore',
        'bastore',
        'castore',
        'sastore',
      ].includes(nm)
    ) {
      const val = stack.pop(),
        idx = stack.pop(),
        arr = stack.pop();
      stmts.push({
        kind: 'expr',
        expr: { kind: 'assign-expr', target: { kind: 'array', array: arr, index: idx }, expr: val },
      });
      return;
    }
    if (op >= 0x59 && op <= 0x5e) this.snapshotDuplicates(ins, stack, stmts);
    switch (op) {
      case 0x57:
      case 0x58:
        discardOperands(stack, op === 0x58, (expr, index, retain) =>
          this.preserveDiscarded(expr, ins.pc, index, stmts, retain),
        );
        return;
      case 0x59:
        stack.dup();
        return;
      case 0x5a:
        stack.dupX1();
        return;
      case 0x5b:
        stack.dupX2();
        return;
      case 0x5c:
        stack.dup2();
        return;
      case 0x5d:
        stack.dup2X1();
        return;
      case 0x5e:
        stack.dup2X2();
        return;
      case 0x5f:
        stack.swap();
        return;
      default:
        break;
    }
    const binOps: Record<string, BinOp> = {
      iadd: '+',
      ladd: '+',
      fadd: '+',
      dadd: '+',
      isub: '-',
      lsub: '-',
      fsub: '-',
      dsub: '-',
      imul: '*',
      lmul: '*',
      fmul: '*',
      dmul: '*',
      idiv: '/',
      ldiv: '/',
      fdiv: '/',
      ddiv: '/',
      irem: '%',
      lrem: '%',
      frem: '%',
      drem: '%',
      ishl: '<<',
      lshl: '<<',
      ishr: '>>',
      lshr: '>>',
      iushr: '>>>',
      lushr: '>>>',
      iand: '&',
      land: '&',
      ior: '|',
      lor: '|',
      ixor: '^',
      lxor: '^',
    };
    if (nm in binOps) {
      const r = stack.pop(),
        l = stack.pop();
      const t = arithType(nm);
      const wide = !!t && t.kind === 'prim' && (t.name === 'long' || t.name === 'double');
      if (binOps[nm] === '^' && r.kind === 'const' && r.ctype === 'int' && r.value === -1) {
        stack.push({ kind: 'unary', op: '~', operand: l, jtype: t });
        return;
      }
      if (binOps[nm] === '^' && l.kind === 'const' && l.ctype === 'long' && l.value === -1n) {
        stack.push({ kind: 'unary', op: '~', operand: r, jtype: t }, true);
        return;
      }
      stack.push({ kind: 'binary', op: binOps[nm], left: l, right: r, jtype: t }, wide);
      return;
    }
    if (['ineg', 'lneg', 'fneg', 'dneg'].includes(nm)) {
      const v = stack.pop();
      const t = arithType(nm);
      stack.push({ kind: 'unary', op: '-', operand: v, jtype: t }, nm === 'lneg' || nm === 'dneg');
      return;
    }
    if (nm === 'lcmp' || nm === 'fcmpl' || nm === 'fcmpg' || nm === 'dcmpl' || nm === 'dcmpg') {
      const r = stack.pop(),
        l = stack.pop();
      stack.push({
        kind: 'binary',
        op: 'cmp',
        left: l,
        right: r,
        jtype: PRIM_INT,
        nanResult: nm === 'lcmp' ? undefined : nm.endsWith('l') ? -1 : 1,
      });
      return;
    }
    if (nm === 'iinc') {
      const slot = ins.local!;
      const name = this.ctx.slotName(this.method, slot, ins.pc, false);
      const d = ins.iincVal!;
      const lv = this.localExpr(slot, ins.pc);
      if (d === 1 || d === -1) {
        const top = stack.items[stack.items.length - 1];
        if (top && top.e.kind === 'local' && top.e.slot === slot && this.lastLoad === top.e) {
          top.e = { kind: 'unary', op: d === 1 ? 'x++' : 'x--', operand: lv };
          this.lastLoad = null;
          return;
        }
      }
      if ((d === 1 || d === -1) && b && insIdx !== undefined) {
        const next = b.instrs[insIdx + 1];
        if (next && isLoadOp(next.op)) {
          const nslot = next.local ?? opcodeSlot(next.name);
          if (nslot === slot) {
            this.pendingPrefix = { slot, op: d === 1 ? '++x' : '--x' };
            return;
          }
        }
      }
      let expr: Expr;
      if (d === 1) expr = { kind: 'unary', op: 'x++', operand: lv };
      else if (d === -1) expr = { kind: 'unary', op: 'x--', operand: lv };
      else
        expr = {
          kind: 'assign-expr',
          target: { kind: 'local', slot, name },
          expr: { kind: 'binary', op: '+', left: lv, right: intConstOf(d), jtype: PRIM_INT },
          op: '+',
        };
      stmts.push({ kind: 'expr', expr });
      return;
    }
    if (nm.length === 3 && nm[1] === '2' && isPrimChar(nm[0]) && isPrimChar(nm[2])) {
      const v = stack.pop();
      const fromT = primOf(nm[0]);
      const to = primOf(nm[2]);
      void fromT;
      const wide = to === 'long' || to === 'double';
      stack.push({ kind: 'cast', jtype: { kind: 'prim', name: to }, expr: v }, wide);
      return;
    }
    if (nm === 'getstatic' || nm === 'getfield') {
      const ref = cp.memberRef(ins.cpIndex!);
      const t = parseFieldDescriptor(ref.descriptor);
      const wide = t.kind === 'prim' && (t.name === 'long' || t.name === 'double');
      if (nm === 'getstatic') {
        stack.push({ kind: 'field-get', owner: ref.owner, name: ref.name, jtype: t }, wide);
      } else {
        const target = stack.pop();
        stack.push({ kind: 'field-get', owner: ref.owner, name: ref.name, target, jtype: t }, wide);
      }
      return;
    }
    if (nm === 'putstatic' || nm === 'putfield') {
      const ref = cp.memberRef(ins.cpIndex!);
      const val = stack.pop();
      if (nm === 'putstatic') {
        stmts.push({
          kind: 'expr',
          expr: {
            kind: 'assign-expr',
            target: { kind: 'field', owner: ref.owner, name: ref.name },
            expr: val,
          },
        });
      } else {
        const target = stack.pop();
        stmts.push({
          kind: 'expr',
          expr: {
            kind: 'assign-expr',
            target: { kind: 'field', owner: ref.owner, name: ref.name, target },
            expr: val,
          },
        });
      }
      return;
    }
    if (
      nm === 'invokevirtual' ||
      nm === 'invokespecial' ||
      nm === 'invokestatic' ||
      nm === 'invokeinterface'
    ) {
      const ref = cp.memberRef(ins.cpIndex!);
      const md = parseMethodDescriptor(ref.descriptor);
      const args: Expr[] = [];
      for (let i = 0; i < md.params.length; i++) args.unshift(stack.pop());
      const returns = md.ret.kind !== 'prim' || md.ret.name !== 'void';
      if (nm !== 'invokestatic') {
        const target = stack.pop();
        if (ref.name === '<init>' && target.kind === 'new-uninit') {
          const newExpr = this.buildNew(target.owner, args, ref.descriptor);
          this.replaceUninit(stack, stmts, target.uid, newExpr);
          if (returns) stack.push(newExpr);
          return;
        }
        if (target.kind === 'sb-chain' && ref.name === 'append') {
          const arg = concatAppendArgument(ref.owner, md.params, md.ret, args);
          if (arg) {
            stack.push({ ...target, parts: [...target.parts, arg] });
            return;
          }
        }
        if (
          target.kind === 'sb-chain' &&
          ref.name === 'toString' &&
          canConcatenateBuilder(target.parts)
        ) {
          stack.push({ kind: 'concat', parts: target.parts, jtype: STR });
          return;
        }
        const isSuper =
          nm === 'invokespecial' &&
          ref.owner !== this.cls.name &&
          (this.cls.superName === ref.owner ||
            this.cls.interfaces.includes(ref.owner) ||
            isSuperOwner(ref.owner));
        if (returns) {
          stack.push(
            {
              kind: 'invoke',
              mode:
                nm === 'invokevirtual'
                  ? 'virtual'
                  : nm === 'invokeinterface'
                    ? 'interface'
                    : 'special',
              owner: ref.owner,
              name: ref.name,
              descriptor: ref.descriptor,
              target,
              args,
              superCall: isSuper,
            },
            isWideRet(ref.descriptor),
          );
        } else {
          this.pushVoidCall(stmts, nm, ref, target, args, isSuper);
        }
        return;
      }
      if (returns) {
        stack.push(
          {
            kind: 'invoke',
            mode: 'static',
            owner: ref.owner,
            name: ref.name,
            descriptor: ref.descriptor,
            args,
          },
          isWideRet(ref.descriptor),
        );
      } else {
        stmts.push({
          kind: 'expr',
          expr: {
            kind: 'invoke',
            mode: 'static',
            owner: ref.owner,
            name: ref.name,
            descriptor: ref.descriptor,
            args,
          },
        });
      }
      return;
    }
    if (nm === 'invokedynamic') {
      this.execInvokeDynamic(ins, stack, stmts);
      return;
    }
    if (nm === 'new') {
      const owner = cp.className(ins.cpIndex!);
      stack.push({ kind: 'new-uninit', owner, uid: ins.pc });
      return;
    }
    if (nm === 'newarray') {
      const len = stack.pop();
      const elem: JType = { kind: 'prim', name: ATYPE_NAMES[ins.atype!] as 'int' };
      const cached = this.arrayInitCache.get(ins.pc);
      if (cached) {
        stack.push(cached);
        return;
      }
      const eager = this.tryArrayInit(b, ins, elem, len);
      if (eager) {
        this.arrayInitCache.set(ins.pc, eager.expr);
        stack.push(eager.expr);
        return;
      }
      stack.push({
        kind: 'new-array',
        elemType: elem,
        dimsExprs: [len],
        dims: 1,
        jtype: { kind: 'array', elem },
      });
      return;
    }
    if (nm === 'anewarray') {
      const len = stack.pop();
      const raw = this.cls.cp.className(ins.cpIndex!);
      const component: JType = raw.startsWith('[')
        ? parseFieldDescriptor(raw)
        : { kind: 'class', name: raw };
      let elem: JType;
      let dims = 1;
      if (raw.startsWith('[')) {
        const arr = parseFieldDescriptor(raw);
        let depth = 1;
        let inner = arr;
        while (inner.kind === 'array') {
          inner = inner.elem;
          depth++;
        }
        elem = inner;
        dims = depth;
      } else {
        elem = { kind: 'class', name: raw };
      }
      const cached = this.arrayInitCache.get(ins.pc);
      if (cached) {
        stack.push(cached);
        return;
      }
      const eager = this.tryArrayInit(b, ins, component, len);
      if (eager) {
        this.arrayInitCache.set(ins.pc, eager.expr);
        stack.push(eager.expr);
        return;
      }
      stack.push({
        kind: 'new-array',
        elemType: elem,
        dimsExprs: [len],
        dims,
        jtype: { kind: 'array', elem: component },
      });
      return;
    }
    if (nm === 'multianewarray') {
      const name = cp.className(ins.cpIndex!);
      const full = parseFieldDescriptor(name);
      const givenDims = ins.dims!;
      let elem = full;
      let depth = 0;
      while (elem.kind === 'array') {
        elem = elem.elem;
        depth++;
      }
      const totalDims = Math.max(depth, givenDims);
      const dimsExprs: Expr[] = [];
      for (let i = 0; i < givenDims; i++) dimsExprs.unshift(stack.pop());
      stack.push({ kind: 'new-array', elemType: elem, dimsExprs, dims: totalDims });
      return;
    }
    if (nm === 'arraylength') {
      stack.push({ kind: 'array-length', array: stack.pop() });
      return;
    }
    if (nm === 'athrow') return;
    if (nm === 'checkcast') {
      const t = this.classTypeAt(ins.cpIndex!);
      const v = stack.pop();
      stack.push({ kind: 'cast', jtype: t, expr: v });
      return;
    }
    if (nm === 'instanceof') {
      const t = this.classTypeAt(ins.cpIndex!);
      const v = stack.pop();
      stack.push({ kind: 'instanceof', expr: v, checkType: t });
      return;
    }
    if (nm === 'monitorenter' || nm === 'monitorexit') {
      stmts.push({ kind: 'expr', expr: { kind: 'monitor', expr: stack.pop() } });
      return;
    }
    throw new SimFail(`unhandled instruction ${nm} (0x${op.toString(16)})`);
  },

  pushVoidCall(
    stmts: Stmt[],
    nm: string,
    ref: { owner: string; name: string; descriptor: string },
    target: Expr,
    args: Expr[],
    isSuper: boolean,
  ): void {
    stmts.push({
      kind: 'expr',
      expr: {
        kind: 'invoke',
        mode:
          nm === 'invokevirtual' ? 'virtual' : nm === 'invokeinterface' ? 'interface' : 'special',
        owner: ref.owner,
        name: ref.name,
        descriptor: ref.descriptor,
        target,
        args,
        superCall: isSuper,
      },
    });
  },

  classTypeAt(idx: number): JType {
    const name = this.cls.cp.className(idx);
    if (name.startsWith('[')) return parseFieldDescriptor(name);
    return { kind: 'class', name };
  },

  pushLoadConst(idx: number, stack: ExprStack, wide2 = false, pc?: number): void {
    try {
      const cv = this.cls.cp.constVal(idx);
      const descriptor =
        cv.type === 'dynamic' ? this.cls.cp.dynamic(idx, 'constant').descriptor : '';
      const wide =
        cv.type === 'long' || cv.type === 'double' || descriptor === 'J' || descriptor === 'D';
      if (wide !== wide2)
        throw new ConstantResolutionError(
          `Invalid ldc width for ${cv.type} at cp[${idx}]`,
          'INVALID_BOOTSTRAP',
        );
      switch (cv.type) {
        case 'int':
          stack.push({ kind: 'const', ctype: 'int', value: cv.value as number });
          break;
        case 'float':
          stack.push({ kind: 'const', ctype: 'float', value: cv.value as number });
          break;
        case 'long':
          stack.push({ kind: 'const', ctype: 'long', value: cv.value as bigint }, true);
          break;
        case 'double':
          stack.push({ kind: 'const', ctype: 'double', value: cv.value as number }, true);
          break;
        case 'string':
          stack.push({ kind: 'const', ctype: 'string', value: cv.value as string });
          break;
        case 'class':
          stack.push({ kind: 'class-literal', jtype: this.classTypeAt(idx) });
          break;
        case 'methodtype':
          stack.push(methodTypeExpression(this.cls.cp.methodType(idx)));
          break;
        case 'methodhandle':
          stack.push(
            bootstrapConstant(this.cls, {
              kind: 'methodHandle',
              handle: this.cls.cp.methodHandle(idx),
            }),
          );
          break;
        case 'dynamic':
          stack.push(dynamicConstant(this.cls, idx), wide);
          break;
        default:
          throw new SimFail(`constant type ${cv.type} is not supported`);
      }
    } catch (error) {
      this.ctx.diagnostics.add({
        code: error instanceof ConstantResolutionError ? error.code : 'UNSUPPORTED_CONSTANT',
        severity: 'error',
        stage: 'simulate',
        className: this.cls.name,
        methodName: this.method.name,
        descriptor: this.method.descriptor,
        bytecodeOffset: pc,
        message: errorMessage(error),
      });
      throw new SimFail(errorMessage(error));
    }
  },

  localExpr(slot: number, pc: number): Expr {
    if (!this.isStatic && slot === 0) return { kind: 'this' };
    const name = this.ctx.slotName(this.method, slot, pc, false);
    const jtype = this.ctx.slotTypeGeneric(this.method, slot, pc);
    return { kind: 'local', slot, name, jtype };
  },

  assignLocal(slot: number, v: Expr, pc: number): Stmt {
    const name = this.ctx.slotName(this.method, slot, pc, false);
    this.ctx.recordSlotType(
      this.method,
      slot,
      (this.method.code?.localVars.length && v.kind !== 'class-literal'
        ? (v as { jtype?: JType }).jtype
        : expressionType(v)) ?? constType(v),
    );
    const pcs = this.sim.slotAssignPc?.get(slot) ?? [];
    if (!pcs.includes(pc)) pcs.push(pc);
    this.sim.slotAssignPc?.set(slot, pcs);
    const jtype = this.ctx.slotTypeGeneric(this.method, slot, pc);
    return {
      kind: 'expr',
      expr: { kind: 'assign-expr', target: { kind: 'local', slot, name, jtype }, expr: v },
    };
  },

  buildNew(owner: string, args: Expr[], descriptor?: string): Expr {
    if (
      (owner === 'java/lang/StringBuilder' || owner === 'java/lang/StringBuffer') &&
      args.length === 0
    ) {
      return { kind: 'sb-chain', parts: [], jtype: { kind: 'class', name: owner } };
    }
    return { kind: 'new', owner, args, descriptor };
  },

  replaceUninit(stack: ExprStack, stmts: Stmt[], uid: number, replacement: Expr): void {
    for (const it of stack.items) {
      if (it.e.kind === 'new-uninit' && it.e.uid === uid) it.e = replacement;
    }
    for (const s of stmts) replaceInStmt(s, uid, replacement);
  },

  tryArrayInit(b: Block, ins: Instr, elem: JType, len: Expr): { expr: Expr } | null {
    if (len.kind !== 'const' || len.ctype !== 'int') return null;
    const n = len.value as number;
    if (n < 0 || n > 4096) return null;
    const startIdx = b.instrs.indexOf(ins) + 1;
    if (startIdx >= b.instrs.length) return null;
    const arrExpr: Expr = { kind: 'new-array', elemType: elem, dimsExprs: [len], dims: 1 };
    const scratch = new ExprStack();
    scratch.push(arrExpr);
    const scratchStmts: Stmt[] = [];
    let stored = 0;
    const vals: Expr[] = [];
    let i = startIdx;
    for (; i < b.instrs.length; i++) {
      const cur = b.instrs[i];
      if (
        cur.op === 0x53 ||
        cur.op === 0x4f ||
        cur.op === 0x50 ||
        cur.op === 0x51 ||
        cur.op === 0x52 ||
        cur.op === 0x54 ||
        cur.op === 0x55 ||
        cur.op === 0x56
      ) {
        try {
          const val = scratch.pop();
          const idx = scratch.pop();
          const arr = scratch.pop();
          if (
            arr !== arrExpr ||
            idx.kind !== 'const' ||
            idx.ctype !== 'int' ||
            (idx.value as number) !== stored
          ) {
            return null;
          }
          vals.push(val);
          stored++;
        } catch {
          return null;
        }
        if (stored === n) {
          if (scratch.depth !== 1) {
            return null;
          }
          b.instrs.splice(startIdx, i - startIdx + 1);
          return { expr: { kind: 'array-init', elemType: elem, values: vals } };
        }
        continue;
      }
      if (
        cur.op === 0x99 ||
        cur.op === 0xaa ||
        cur.op === 0xab ||
        cur.op === 0xa7 ||
        cur.op === 0xc8 ||
        cur.op === 0xbf ||
        (cur.op >= 0xac && cur.op <= 0xb1)
      ) {
        return null;
      }
      if (scratchStmts.length > 0) return null;
      try {
        this.execInstr(cur, scratch, scratchStmts, b);
      } catch {
        return null;
      }
    }
    return null;
  },
};
