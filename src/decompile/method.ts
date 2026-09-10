import { DecompileLimitError } from './budget.js';
import { applyCodeTypeAnnotations } from './code-annotations.js';
import { verifyFrames } from './verify.js';
import { validateStackMaps } from './stackmap.js';
import { splitLocalSlots } from './locals.js';
import { errorMessage, type DiagnosticStage } from './diagnostics.js';
import { Stmt } from '../ast/ast.js';
import { buildCFG } from '../bytecode/cfg.js';
import { branchSuccessors, decodeBytecode, Instr } from '../bytecode/decode.js';
import type { ClassFile, MethodInfo } from '../classfile/model.js';
import { opName } from '../classfile/opcodes.js';
import { Ctx } from './context.js';
import { applyPatterns } from './patterns/index.js';
import { Simulator } from './simulate/index.js';
import { Structurer } from './structure/index.js';

export interface MethodBody {
  stmts: Stmt[];
  failed?: string;
  failedStage?: DiagnosticStage;
  disasm?: string;
}

const methodCache = new WeakMap<Ctx, WeakMap<MethodInfo, MethodBody | null>>();

function constPushValue(ins: Instr): number | null {
  if (ins.op >= 0x02 && ins.op <= 0x08) return ins.op - 0x03;
  if (ins.op === 0x10 || ins.op === 0x11) return ins.imm ?? null;
  return null;
}

function foldConstBranches(instrs: Instr[], method: MethodInfo): Instr[] {
  const entries = new Set([
    ...instrs.flatMap(branchSuccessors),
    ...(method.code?.exceptions.flatMap((entry) => [entry.startPc, entry.endPc, entry.handlerPc]) ??
      []),
    ...(method.code?.stackMapFrames?.map((frame) => frame.offset) ?? []),
  ]);
  const out: Instr[] = [];
  for (let i = 0; i < instrs.length; i++) {
    const ins = instrs[i];
    const prev = out[out.length - 1];
    const v = prev ? constPushValue(prev) : null;
    if (
      v !== null &&
      !entries.has(ins.pc) &&
      (ins.op === 0x99 || ins.op === 0x9a) &&
      ins.branch !== undefined &&
      instrs[i - 1] === prev
    ) {
      const take = ins.op === 0x99 ? v === 0 : v !== 0;
      out[out.length - 1] = { pc: prev.pc, op: 0x00, name: 'nop', size: prev.size };
      out.push({
        ...ins,
        op: 0xa7,
        name: 'goto',
        branch: take ? ins.branch : ins.pc + 3,
        imm: undefined,
        cpIndex: undefined,
        local: undefined,
        atype: undefined,
        dims: undefined,
        switchCases: undefined,
        switchDefault: undefined,
      });
      continue;
    }
    out.push(ins);
  }
  return out;
}

export function decompileMethod(ctx: Ctx, cls: ClassFile, method: MethodInfo): MethodBody | null {
  ctx.budget.check();
  if (!method.code) return null;
  let perCtx = methodCache.get(ctx);
  if (!perCtx) methodCache.set(ctx, (perCtx = new WeakMap()));
  const cached = perCtx.get(method);
  if (cached !== undefined) return structuredClone(cached);
  let out: MethodBody | null;
  try {
    out = decompileMethodImpl(ctx, cls, method);
  } catch (e) {
    if (e instanceof DecompileLimitError) throw e;
    out = {
      stmts: [],
      failed: `internal error: ${errorMessage(e)}`,
      failedStage: 'decompile',
      disasm: disassemble(method),
    };
  }
  if (out?.failed) {
    ctx.diagnostics.add({
      code: 'METHOD_DECOMPILE_FAILED',
      severity: 'error',
      stage: out.failedStage ?? 'decompile',
      className: cls.name,
      methodName: method.name,
      descriptor: method.descriptor,
      message: out.failed,
    });
  }
  perCtx.set(method, out);

  return structuredClone(out);
}

function decompileMethodImpl(ctx: Ctx, cls: ClassFile, method: MethodInfo): MethodBody | null {
  const code = method.code!;
  let instrs: Instr[];
  try {
    ctx.budget.check(code.code.length);
    instrs = decodeBytecode(code.code);
    validateStackMaps(method, instrs);
    verifyFrames(ctx, cls, method, instrs);
    instrs = foldConstBranches(instrs, method);
  } catch (e) {
    if (e instanceof DecompileLimitError) throw e;
    return {
      stmts: [],
      failed: `decode error: ${errorMessage(e)}`,
      failedStage: 'decode',
      disasm: disassemble(method),
    };
  }
  const leaders = new Set<number>();
  for (const ex of code.exceptions) {
    leaders.add(ex.handlerPc);
    leaders.add(ex.startPc);
  }
  for (const frame of code.stackMapFrames ?? []) leaders.add(frame.offset);
  let cfg;
  try {
    cfg = buildCFG(instrs, leaders, new Set(code.exceptions.map((ex) => ex.handlerPc)), ctx.budget);
  } catch (e) {
    if (e instanceof DecompileLimitError) throw e;
    return { stmts: [], failed: errorMessage(e), failedStage: 'cfg', disasm: disassemble(method) };
  }
  ctx.budget.check();
  const localCount = splitLocalSlots(cfg, method);
  const sim = Simulator.run(ctx, cls, method, cfg, localCount);
  if (sim.failed) {
    return {
      stmts: [],
      failed: `simulation error: ${sim.failed}`,
      failedStage: 'simulate',
      disasm: disassemble(method),
    };
  }
  ctx.budget.check();
  const st = new Structurer(ctx, cls, method, cfg, sim);
  const res = st.run();
  if (res.failed) {
    return {
      stmts: [],
      failed: `structure error: ${res.failed}`,
      failedStage: 'structure',
      disasm: disassemble(method),
    };
  }
  let stmts = res.stmts;
  try {
    applyCodeTypeAnnotations(ctx, cls, method, stmts, instrs);
    stmts = applyPatterns(ctx, cls, method, stmts, sim);
  } catch (e) {
    if (e instanceof DecompileLimitError) throw e;
    return {
      stmts: [],
      failed: `transform error: ${errorMessage(e)}`,
      failedStage: 'transform',
      disasm: disassemble(method),
    };
  }
  if (containsMonitor(stmts)) {
    return {
      stmts: [],
      failed: 'unstructured monitor',
      failedStage: 'structure',
      disasm: disassemble(method),
    };
  }
  return { stmts };
}

function containsMonitor(stmts: Stmt[]): boolean {
  let found = false;
  const visit = (list: Stmt[]): void => {
    for (const s of list) {
      if (found) return;
      switch (s.kind) {
        case 'expr':
          if (s.expr.kind === 'monitor') found = true;
          break;
        case 'if':
          visit(s.thenS);
          if (s.elseS) visit(s.elseS);
          break;
        case 'while':
        case 'do-while':
          visit(s.body);
          break;
        case 'for':
          visit(s.init);
          visit(s.update);
          visit(s.body);
          break;
        case 'foreach':
          visit(s.body);
          break;
        case 'switch':
          for (const c of s.cases) visit(c.body);
          break;
        case 'try':
          visit(s.body);
          for (const c of s.catches) visit(c.body);
          if (s.finallyS) visit(s.finallyS);
          break;
        case 'sync':
          visit(s.body);
          break;
        case 'label':
          visit([s.inner]);
          break;
        default:
          break;
      }
    }
  };
  visit(stmts);
  return found;
}

export function disassemble(method: MethodInfo): string {
  const code = method.code;
  if (!code) return '(no code)';
  const lines: string[] = [];
  try {
    const instrs = foldConstBranches(decodeBytecode(code.code), method);
    for (const ins of instrs) {
      let operand = '';
      if (ins.local !== undefined) operand = ` ${ins.local}`;
      else if (ins.imm !== undefined) operand = ` ${ins.imm}`;
      else if (ins.branch !== undefined) operand = ` ${ins.branch}`;
      else if (ins.cpIndex !== undefined) operand = ` #${ins.cpIndex}`;
      else if (ins.atype !== undefined) operand = ` ${ins.atype}`;
      else if (ins.dims !== undefined) operand = ` ${ins.dims}`;
      if (ins.switchCases) {
        lines.push(`${pad(ins.pc)}: ${ins.name} {`);
        for (const c of ins.switchCases) lines.push(`        ${c.value}: ${c.target}`);
        lines.push(`        default: ${ins.switchDefault}`);
        lines.push('    }');
        continue;
      }
      lines.push(`${pad(ins.pc)}: ${ins.name}${operand}`);
    }
  } catch (e) {
    if (e instanceof DecompileLimitError) throw e;
    lines.push(`(disassembly failed: ${(e as Error).message})`);
  }
  if (code.exceptions.length) {
    lines.push('    Exception table:');
    lines.push('       from    to  target type');
    for (const ex of code.exceptions) {
      lines.push(
        `      ${pad(ex.startPc, 4)} ${pad(ex.endPc, 4)} ${pad(ex.handlerPc, 4)}   ${ex.catchType ?? 'any'}`,
      );
    }
  }
  return lines.join('\n       ');
}

function pad(n: number, w = 5): string {
  return String(n).padStart(w);
}

export function opcodeDisplayName(op: number): string {
  return opName(op);
}
