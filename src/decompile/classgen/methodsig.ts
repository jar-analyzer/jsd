import { annotatedType, annotatedTypeParams } from '../type-annotations.js';
import type { Ann } from '../../classfile/model.js';
import type { TypeParam } from '../../classfile/types.js';
import { isAssertionFlag } from '../patterns/asserts.js';
import { Stmt } from '../../ast/ast.js';
import { Acc, ClassFile, FieldInfo, MethodInfo } from '../../classfile/model.js';
import {
  JType,
  MethodSig,
  parseClassSignature,
  parseFieldDescriptor,
  parseMethodDescriptor,
  parseSignature,
} from '../../classfile/types.js';
import { Ctx, JAVA_KEYWORDS } from '../context.js';

export interface MethodSigInfo {
  typeParams: TypeParam[];
  receiver?: JType;
  receiverName?: string;
  constructorAnnotations?: Ann[];
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
  const annotations = m.typeAnnotations ?? [];
  ret = annotatedType(
    ret,
    annotations.filter((a) => a.targetType === 0x14 && m.name !== '<init>'),
    ctx,
  );
  params = params.map((type, i) =>
    annotatedType(
      type,
      annotations.filter((a) => a.targetType === 0x16 && a.index === i),
      ctx,
    ),
  );
  thrown = thrown.map((type, i) =>
    annotatedType(
      type,
      annotations.filter((a) => a.targetType === 0x17 && a.index === i),
      ctx,
    ),
  );
  typeParams = annotatedTypeParams(typeParams, annotations, 0x01, ctx);
  const receiverAnnotations = annotations.filter((a) => a.targetType === 0x15);
  const receiverOwner = m.name === '<init>' ? outerRefName(cls) : cls.name;
  const receiverTypeOf = (name: string, seen = new Set<string>()): JType => {
    if (seen.has(name)) throw new Error('Cyclic receiver type');
    seen.add(name);
    const receiverClass = ctx.lookup(name);
    const type: JType = { kind: 'class', name };
    if (receiverClass?.signature) {
      const parameters = parseClassSignature(receiverClass.signature).typeParams;
      if (parameters.length)
        type.args = parameters.map((param) => ({ kind: 'typevar', name: param.name }));
    }
    const inner = ctx.innerClass(name);
    if (inner?.outer && !(inner.access & 8)) type.owner = receiverTypeOf(inner.outer, seen);
    return type;
  };
  const receiverType: JType = receiverAnnotations.length
    ? receiverTypeOf(receiverOwner ?? cls.name)
    : { kind: 'class', name: cls.name };
  return {
    typeParams,
    receiver: receiverAnnotations.length
      ? annotatedType(receiverType, receiverAnnotations, ctx)
      : undefined,
    receiverName:
      m.name === '<init>'
        ? `${ctx
            .className(receiverOwner ?? cls.name)
            .split('.')
            .pop()}.this`
        : 'this',
    constructorAnnotations:
      m.name === '<init>'
        ? annotations.filter((a) => a.targetType === 0x14).map((a) => a.annotation)
        : undefined,
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
  tp: TypeParam,
  rt: (t: JType) => string,
  renderAnnotation: (ann: Ann) => string = () => '',
): string {
  const bounds: string[] = [];
  if (
    tp.classBound &&
    (!(tp.classBound.kind === 'class' && tp.classBound.name === 'java/lang/Object') ||
      tp.classBound.annotations?.length)
  ) {
    bounds.push(rt(tp.classBound));
  }
  bounds.push(...tp.ifaceBounds.map(rt));
  const annotations = tp.annotations?.map(renderAnnotation).filter(Boolean).join(' ');
  const name = `${annotations ? annotations + ' ' : ''}${tp.name}`;
  return bounds.length ? `${name} extends ${bounds.join(' & ')}` : name;
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
