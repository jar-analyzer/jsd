import { isAssertionFlag } from '../patterns/asserts.js';
import { Stmt } from '../../ast/ast.js';
import { Acc, ClassFile, FieldInfo, MethodInfo } from '../../classfile/model.js';
import {
  JType,
  MethodSig,
  parseFieldDescriptor,
  parseMethodDescriptor,
  parseSignature,
} from '../../classfile/types.js';
import { Ctx, JAVA_KEYWORDS } from '../context.js';

export interface MethodSigInfo {
  typeParams: { name: string; classBound: JType | null; ifaceBounds: JType[] }[];
  params: { name: string; type: JType; varargs?: boolean }[];
  ret: JType;
  thrown: JType[];
  slots: number[];
}

function outerRefName(cls: ClassFile): string | null {
  const ic = cls.innerClasses.find((x) => x.inner === cls.name);
  if (ic?.outer && !(ic.access & 0x0008)) return ic.outer;
  return cls.enclosing?.class ?? null;
}

export function ctorHasOuterParam(cls: ClassFile, ctor: MethodInfo): boolean {
  const outer = outerRefName(cls);
  if (!outer) return false;
  const raw = parseMethodDescriptor(ctor.descriptor);
  const p0 = raw.params[0];
  return p0?.kind === 'class' && p0.name === outer;
}

export function buildMethodSig(ctx: Ctx, cls: ClassFile, m: MethodInfo): MethodSigInfo {
  void ctx;
  let raw: ReturnType<typeof parseMethodDescriptor>;
  try {
    raw = parseMethodDescriptor(m.descriptor);
  } catch {
    raw = { params: [], ret: { kind: 'class', name: 'java/lang/Object' } as JType };
  }
  let ret: JType = raw.ret;
  let params = raw.params.map((t) => ({ ...t }));
  let typeParams: MethodSigInfo['typeParams'] = [];
  let thrown: JType[] = m.thrown.map((t) => ({ kind: 'class', name: t }) as JType);
  if (m.signature) {
    const s = safeSig(m.signature);
    if (s && !('kind' in s)) {
      const ms = s as MethodSig;
      if (!(m.name === '<init>' && ms.params.length !== raw.params.length)) {
        ret = ms.ret;
        params = ms.params.map((t) => ({ ...t }));
        typeParams = ms.typeParams;
        if (ms.thrown.length) thrown = ms.thrown;
      }
    } else if (s && 'kind' in s) {
    }
  }
  let innerStrip = 0;
  if (m.name === '<init>' && params.length >= 1 && ctorHasOuterParam(cls, m)) {
    params = params.slice(1);
    innerStrip = 1;
  }
  const isEnum = (cls.access & Acc.Enum) !== 0;
  let enumStrip = 0;
  if (isEnum && m.name === '<init>' && m.descriptor.startsWith('(Ljava/lang/String;I')) {
    enumStrip = 2;
    if (params.length >= 2) {
      const p0 = params[0],
        p1 = params[1];
      if (
        p0.kind === 'class' &&
        p0.name === 'java/lang/String' &&
        p1.kind === 'prim' &&
        p1.name === 'int'
      ) {
        params = params.slice(2);
      }
    }
  }
  const isStatic = (m.access & Acc.Static) !== 0;
  const slots: number[] = [];
  let slot = isStatic || m.name === '<clinit>' ? 0 : 1;
  if (innerStrip) slot += innerStrip;
  if (enumStrip) slot += enumStrip;
  const varargs = (m.access & Acc.Varargs) !== 0;
  const names: string[] = [];
  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    if (enumStrip > 0) {
      const skip = enumStrip;
      void skip;
    }
    slots.push(slot);
    slot += p.kind === 'prim' && (p.name === 'long' || p.name === 'double') ? 2 : 1;
    let nm: string | null = null;
    if (m.methodParameters && m.methodParameters[i]) nm = m.methodParameters[i].name;
    if (!nm) {
      for (const lv of m.code?.localVars ?? []) {
        if (lv.index === slots[i] && lv.start === 0) {
          nm = lv.name;
          break;
        }
      }
    }
    if (!nm) {
      for (const lv of m.code?.localVars ?? []) {
        if (lv.index === slots[i]) {
          nm = lv.name;
          break;
        }
      }
    }
    names.push(safeIdent(nm, `arg${i}`));
  }
  return {
    typeParams,
    params: params.map((t, i) => ({
      name: names[i],
      type: t,
      varargs: varargs && i === params.length - 1,
    })),
    ret,
    thrown,
    slots,
  };
}

export function safeIdent(n: string | null, fallback: string): string {
  if (!n || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n) || JAVA_KEYWORDS.has(n)) return fallback;
  return n;
}

export function safeSig(sig: string): MethodSig | JType | null {
  try {
    return parseSignature(sig);
  } catch {
    return null;
  }
}

export function sigType(sig: string | undefined): JType | null {
  if (!sig) return null;
  const s = safeSig(sig);
  if (s && 'kind' in s) return s as JType;
  return null;
}

export function typeParamStr(
  tp: { name: string; classBound: JType | null; ifaceBounds: JType[] },
  rt: (t: JType) => string,
): string {
  const bounds: string[] = [];
  if (
    tp.classBound &&
    !(tp.classBound.kind === 'class' && tp.classBound.name === 'java/lang/Object')
  ) {
    bounds.push(rt(tp.classBound));
  }
  bounds.push(...tp.ifaceBounds.map(rt));
  return bounds.length ? `${tp.name} extends ${bounds.join(' & ')}` : tp.name;
}

export function isSyntheticField(f: FieldInfo, cls?: ClassFile): boolean {
  if (f.name.startsWith('$assertionsDisabled')) return !!cls && isAssertionFlag(cls, f);
  return (
    (f.synthetic || (f.access & Acc.Synthetic) !== 0) &&
    (f.name.startsWith('this$') ||
      f.name.startsWith('$SwitchMap') ||
      f.name === '$VALUES' ||
      f.name === '$ENUM$VALUES')
  );
}

export function innerStripCtor(m: MethodInfo, cls: ClassFile): boolean {
  if (m.name !== '<init>') return false;
  return ctorHasOuterParam(cls, m);
}

export function isCanonicalRecordCtor(m: MethodInfo, stmtsIn: Stmt[], cls: ClassFile): boolean {
  if (m.name !== '<init>' || cls.recordComponents.length === 0) return false;
  const md = parseMethodDescriptor(m.descriptor);
  if (md.params.length !== cls.recordComponents.length) return false;
  let stmts =
    stmtsIn.length &&
    stmtsIn[0].kind === 'expr' &&
    stmtsIn[0].expr.kind === 'invoke' &&
    (stmtsIn[0].expr as { superCall?: boolean; owner?: string }).superCall &&
    (stmtsIn[0].expr as { owner?: string }).owner === 'java/lang/Record'
      ? stmtsIn.slice(1)
      : stmtsIn;
  if (stmts.length && stmts[stmts.length - 1].kind === 'return') stmts = stmts.slice(0, -1);
  if (stmts.length !== cls.recordComponents.length) return false;
  let slot = 1;
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    if (s.kind !== 'expr' || s.expr.kind !== 'assign-expr' || s.expr.target.kind !== 'field')
      return false;
    const t = s.expr.target as { name: string; target?: unknown };
    const targetExpr = t.target as { kind?: string } | undefined;
    if (!targetExpr || targetExpr.kind !== 'this') return false;
    if (t.name !== cls.recordComponents[i].name) return false;
    if (s.expr.op || s.expr.expr.kind !== 'local' || s.expr.expr.slot !== slot) return false;
    const type = md.params[i];
    slot += type.kind === 'prim' && ['long', 'double'].includes(type.name) ? 2 : 1;
  }
  return true;
}
