import { negate as negateExpr } from '../../ast/conditions.js';
import { ClassFile, FieldInfo } from '../../classfile/model.js';
import { decodeBytecode } from '../../bytecode/decode.js';
import { Expr, Stmt } from '../../ast/ast.js';
import { transformChildren } from './index.js';

export function foldAsserts(stmts: Stmt[], cls?: ClassFile): Stmt[] {
  const out: Stmt[] = [];
  for (const s of stmts) {
    if (s.kind === 'if' && s.thenS.length === 1) {
      const inner = s.thenS[0];
      if (inner.kind === 'throw' && isAssertionErrorNew(inner.expr)) {
        const cond = stripAssertionDisabled(s.cond, cls);
        if (cond.ok) {
          const args = (inner.expr as { args?: Expr[] }).args ?? [];
          const assertCond = negateExpr(cond.rest);
          out.push({ kind: 'assert', cond: assertCond, msg: args.length ? args[0] : undefined });
          if (s.elseS) out.push(...foldAsserts(s.elseS, cls));
          continue;
        }
      }
    }
    transformChildren(s, (list) => foldAsserts(list, cls));
    out.push(s);
  }
  return out;
}

function isAssertionErrorNew(e: Expr): boolean {
  return e.kind === 'new' && e.owner === 'java/lang/AssertionError';
}

function stripAssertionDisabled(cond: Expr, cls?: ClassFile): { ok: boolean; rest: Expr } {
  if (cond.kind === 'binary' && cond.op === '&&') {
    const l = cond.left;
    if (l.kind === 'unary' && l.op === '!' && isAssertionsDisabled(l.operand, cls)) {
      return { ok: true, rest: cond.right };
    }
  }
  return { ok: false, rest: cond };
}

function isAssertionsDisabled(e: Expr, cls?: ClassFile): boolean {
  if (!cls || e.kind !== 'field-get' || e.target || e.owner !== cls.name) return false;
  const field = cls.fields.find((f) => f.name === e.name);
  return !!field && isAssertionFlag(cls, field);
}

export function isAssertionFlag(cls: ClassFile, field: FieldInfo): boolean {
  if (
    !(field.synthetic || field.access & 0x1000) ||
    field.name !== '$assertionsDisabled' ||
    field.descriptor !== 'Z' ||
    (field.access & 0x18) !== 0x18
  )
    return false;
  const code = cls.methods.find((m) => m.name === '<clinit>')?.code;
  if (!code) return false;
  try {
    const ins = decodeBytecode(code.code);
    for (let i = 0; i + 6 < ins.length; i++) {
      const [load, call, branch, yes, jump, no, store] = ins.slice(i, i + 7);
      if (
        ![0x12, 0x13].includes(load.op) ||
        call.op !== 0xb6 ||
        branch.op !== 0x9a ||
        yes.op !== 0x04 ||
        jump.op !== 0xa7 ||
        no.op !== 0x03 ||
        store.op !== 0xb3 ||
        branch.branch !== no.pc ||
        jump.branch !== store.pc
      )
        continue;
      const method = cls.cp.memberRef(call.cpIndex!);
      const target = cls.cp.memberRef(store.cpIndex!);
      cls.cp.className(load.cpIndex!);
      if (
        method.owner === 'java/lang/Class' &&
        method.name === 'desiredAssertionStatus' &&
        method.descriptor === '()Z' &&
        target.owner === cls.name &&
        target.name === field.name &&
        target.descriptor === 'Z'
      )
        return true;
    }
  } catch {}
  return false;
}
