import { javaLiteral } from '../printer/literals.js';
import { Stmt } from '../../ast/ast.js';
import { Acc, FieldInfo, MethodInfo } from '../../classfile/model.js';
import {
  JType,
  parseFieldDescriptor,
  parseMethodDescriptor,
  parseSignature,
} from '../../classfile/types.js';
import { resolveLambda } from '../lambdas.js';
import { decompileMethod } from '../method.js';
import {
  hoistWideScopeLocals,
  markExternalForDecls,
  firstReadExpectsBoolean,
} from '../patterns/index.js';
import { RenderCtx, renderStmts, typeStr, nestedDisplay, simpleOf } from '../printer/index.js';
import { annotationStr, annValStr } from './annotations.js';
import {
  buildMethodSig,
  sigType,
  typeParamStr,
  isSyntheticField,
  innerStripCtor,
  isCanonicalRecordCtor,
  safeIdent,
} from './methodsig.js';
import type { MethodSigInfo } from './methodsig.js';
import type { ClassGenerator } from './index.js';

const PRIM_INT: JType = { kind: 'prim', name: 'int' };

function isPrimBoolT(t: JType | undefined): boolean {
  return !!t && t.kind === 'prim' && t.name === 'boolean';
}

function declTypeOf(
  ctx: import('../context.js').Ctx,
  m: MethodInfo,
  slot: number,
  stmts: Stmt[],
  fallback?: JType,
): JType | undefined {
  const t = ctx.slotInferredType(m, slot) ?? fallback;
  if (isPrimBoolT(t) && !readExpectsBool(ctx, m, slot, stmts)) return PRIM_INT;
  return t;
}

function readExpectsBool(
  ctx: import('../context.js').Ctx,
  m: MethodInfo,
  slot: number,
  stmts: Stmt[],
): boolean {
  let retBool = false;
  try {
    const ret = parseMethodDescriptor(m.descriptor).ret;
    retBool = ret.kind === 'prim' && ret.name === 'boolean';
  } catch {
    retBool = false;
  }
  return firstReadExpectsBoolean(stmts, slot, {
    retIsBoolean: retBool,
    slotIsBoolean: (s) => s !== slot && isPrimBoolT(ctx.slotInferredType(m, s)),
    fieldIsBoolean: () => false,
    ctorParamBoolean: () => false,
  });
}

export const membersPart: ThisType<ClassGenerator> &
  Pick<
    ClassGenerator,
    | 'renderMembers'
    | 'renderField'
    | 'shouldSkipMethod'
    | 'renderMethod'
    | 'enumConstantArgs'
    | 'filterClinit'
    | 'methodHeader'
    | 'methodRenderCtx'
    | 'constValueStr'
  > = {
  renderMembers(): void {
    const isRecord = this.isRecord;
    const recordFieldNames = new Set(this.cls.recordComponents.map((c) => c.name));
    const enumConsts: FieldInfo[] = [];
    this.out.push('');
    if (this.isEnum) {
      for (const f of this.cls.fields) {
        if ((f.access & Acc.Enum) !== 0 && (f.access & Acc.Static) !== 0) enumConsts.push(f);
      }
      if (enumConsts.length) {
        const ctorArgs = this.enumConstantArgs();
        const names = enumConsts
          .map((f) => {
            const args = ctorArgs.get(f.name);
            return args ? `${f.name}(${args})` : f.name;
          })
          .join(', ');
        this.out.push(`    ${names};`);
        this.out.push('');
      }
    }
    for (const f of this.cls.fields) {
      if (f.access & Acc.Enum) continue;
      if (recordFieldNames.has(f.name) && (f.access & 0x0002) !== 0 && isRecord) continue;
      if (isSyntheticField(f)) continue;
      this.renderField(f);
    }
    for (const m of this.cls.methods) {
      if (this.shouldSkipMethod(m)) continue;
      this.renderMethod(m);
    }
  },

  renderField(f: FieldInfo): void {
    const a = f.access;
    if (
      f.name.startsWith('this$') ||
      f.name.startsWith('$assertionsDisabled') ||
      f.name.startsWith('$SwitchMap') ||
      f.name.startsWith('$ENUM$VALUES') ||
      f.name === '$VALUES'
    )
      return;
    const mods: string[] = [];
    if (a & Acc.Public) mods.push('public');
    if (a & Acc.Private) mods.push('private');
    if (a & Acc.Protected) mods.push('protected');
    if (a & Acc.Static) mods.push('static');
    if (a & Acc.Final) mods.push('final');
    if (a & Acc.Volatile) mods.push('volatile');
    if (a & Acc.Transient) mods.push('transient');
    let t = sigType(f.signature);
    if (!t) {
      try {
        t = parseFieldDescriptor(f.descriptor);
      } catch {
        t = { kind: 'class', name: 'java/lang/Object' };
      }
    }
    for (const ann of f.annotations) {
      const s = annotationStr(ann, this);
      if (s) this.out.push('    ' + s);
    }
    let line = `    ${mods.join(' ')}${mods.length ? ' ' : ''}${this.renderType(t)} ${f.name}`;
    if (
      f.constantValue !== undefined &&
      (a & (Acc.Static | Acc.Final)) === (Acc.Static | Acc.Final)
    ) {
      const cv = this.constValueStr(f);
      if (cv !== null) line += ` = ${cv}`;
    }
    this.out.push(line + ';');
  },

  shouldSkipMethod(m: MethodInfo): boolean {
    if (m.name === '<clinit>') return false;
    if (m.name.startsWith('lambda$')) return true;
    const a = m.access;
    if (
      m.name === '$deserializeLambda$' &&
      m.descriptor === '(Ljava/lang/invoke/SerializedLambda;)Ljava/lang/Object;' &&
      (a & 0x100a) === 0x100a
    )
      return true;
    if ((a & Acc.Bridge) !== 0 || m.synthetic) {
      if (m.name.startsWith('lambda$')) return true;
      if (m.name.startsWith('access$')) return true;
      if (m.name.startsWith('$SWITCH_TABLE$')) return true;
      if ((a & Acc.Bridge) !== 0) return true;
      if (m.synthetic && m.name !== '<init>') return true;
    }
    if (m.name.startsWith('access$') || m.name.startsWith('$SWITCH_TABLE$')) return true;
    if (this.isEnum && (m.name === 'values' || m.name === 'valueOf') && a & Acc.Static) {
      if (m.name === 'values' && m.descriptor === '()[L' + this.cls.name + ';') return true;
      if (m.name === 'valueOf' && m.descriptor === `(Ljava/lang/String;)L${this.cls.name};`)
        return true;
    }
    if (this.isRecord && (m.access & 0x0000) === 0) {
    }
    return false;
  },

  renderMethod(m: MethodInfo): void {
    if (m.name === '<clinit>') {
      const body = decompileMethod(this.ctx, this.cls, m);
      if (!body) return;
      if (body.failed) {
        this.out.push('    /* <clinit> failed: ' + body.failed + ' */');
        this.out.push('    static {');
        this.out.push('        /* decompilation failed');
        this.out.push('       ' + (body.disasm ?? '').split('\n').join('\n           '));
        this.out.push('        */');
        this.out.push('    }');
        return;
      }
      let stmts = this.filterClinit(body.stmts);
      if (stmts.length && stmts[stmts.length - 1].kind === 'return') stmts = stmts.slice(0, -1);
      if (!stmts.length) return;
      const clrc = this.methodRenderCtx(m);
      clrc.scopes.push(new Map());
      this.out.push('    static {');
      this.out.push(...renderStmts(stmts, clrc, 2));
      this.out.push('    }');
      this.out.push('');
      return;
    }
    const sig = this.methodSignature(m);
    const paramRc = this.methodRenderCtx(m);
    for (const ann of m.annotations) {
      const s = annotationStr(ann, this);
      if (s) this.out.push('    ' + s);
    }
    const header = this.methodHeader(m, sig, paramRc);
    const isAbstract = (m.access & Acc.Abstract) !== 0 || (m.access & Acc.Native) !== 0 || !m.code;
    if (isAbstract) {
      const defaultValue = m.annotationDefault
        ? ` default ${annValStr(m.annotationDefault, this)}`
        : '';
      this.out.push(`    ${header}${defaultValue};`);
      this.out.push('');
      return;
    }
    const body = decompileMethod(this.ctx, this.cls, m);
    if (!body) {
      this.out.push(`    ${header};`);
      this.out.push('');
      return;
    }
    if (body.failed) {
      this.out.push(`    ${header} {`);
      this.out.push('        /* METHOD BODY DECOMPILATION FAILED: ' + body.failed);
      this.out.push('           ' + (body.disasm ?? '').split('\n').join('\n           '));
      this.out.push('        */');
      this.out.push('        throw new UnsupportedOperationException("decompilation failed");');
      this.out.push('    }');
      this.out.push('');
      return;
    }
    let stmts = body.stmts;
    if (this.isRecord && m.name === '<init>' && isCanonicalRecordCtor(m, stmts, this.cls)) return;
    if (
      this.isRecord &&
      (m.name === 'toString' || m.name === 'hashCode' || m.name === 'equals') &&
      stmts.length === 1 &&
      stmts[0].kind === 'return' &&
      stmts[0].expr &&
      (stmts[0].expr as { kind?: string }).kind === 'raw'
    ) {
      return;
    }
    const mrc0 = this.methodRenderCtx(m, stmts);
    const lvtNames = new Map<number, Set<string>>();
    for (const lv of m.code?.localVars ?? []) {
      let names = lvtNames.get(lv.index);
      if (!names) lvtNames.set(lv.index, (names = new Set()));
      names.add(lv.name);
    }
    const hoistable = (slot: number): boolean => {
      if (mrc0.declared.has(slot)) return false;
      if (slot >= 1000) return true;
      const names = lvtNames.get(slot);
      return !names || names.size <= 1;
    };
    markExternalForDecls(stmts);
    const hoisted = hoistWideScopeLocals(
      stmts,
      (slot) =>
        hoistable(slot)
          ? declTypeOf(this.ctx, m, slot, stmts, mrc0.slotTypes.get(slot))
          : undefined,
      hoistable,
    );
    if (hoisted.decls.length) {
      stmts = [...hoisted.decls, ...stmts];
    }
    if (m.name === '<init>') {
      const superIdx = stmts.findIndex(
        (st) =>
          st.kind === 'expr' &&
          st.expr.kind === 'invoke' &&
          st.expr.name === '<init>' &&
          (st.expr as { superCall?: boolean }).superCall,
      );
      if (superIdx > 0) {
        const [superStmt] = stmts.splice(superIdx, 1);
        stmts.unshift(superStmt);
      }
    }
    if (innerStripCtor(m, this.cls)) {
      stmts = stmts.filter((st) => {
        if (st.kind !== 'expr') return true;
        const e = st.expr;
        if (e.kind === 'assign-expr' && (e.target as { name?: string }).name === 'this$0')
          return false;
        if (
          e.kind === 'invoke' &&
          e.name === 'requireNonNull' &&
          e.owner === 'java/util/Objects' &&
          e.args.length === 1 &&
          e.args[0].kind === 'local' &&
          (e.args[0] as { slot?: number }).slot === 1
        )
          return false;
        return true;
      });
    }
    if (this.isEnum && m.name === '<init>') {
      while (
        stmts.length &&
        stmts[0].kind === 'expr' &&
        stmts[0].expr.kind === 'invoke' &&
        (stmts[0].expr as { superCall?: boolean }).superCall &&
        (stmts[0].expr as { owner?: string }).owner === 'java/lang/Enum'
      ) {
        stmts.shift();
      }
    }
    const mrc = mrc0;
    mrc.scopes.push(new Map());
    for (const [slot, name] of hoisted.declared) {
      mrc.scopes[0].set(slot, name);
      mrc.declared.add(slot);
    }
    this.out.push(`    ${header} {`);
    this.out.push(...renderStmts(stmts, mrc, 2));
    this.out.push('    }');
    this.out.push('');
  },

  enumConstantArgs(): Map<string, string> {
    const out = new Map<string, string>();
    const clinit = this.cls.methods.find((x) => x.name === '<clinit>');
    if (!clinit?.code) return out;
    const body = decompileMethod(this.ctx, this.cls, clinit);
    if (!body || body.failed) return out;
    const mrc = this.methodRenderCtx(clinit);
    mrc.scopes.push(new Map());
    const lines = renderStmts(body.stmts, mrc, 0);
    for (const l of lines) {
      const m = /\b(\w+) = new \w+\("([^"]*)", \d+(?:, (.+))?\);/.exec(l.trim());
      if (m && m[1] === m[2]) out.set(m[1], m[3] ?? '');
    }
    return out;
  },

  filterClinit(stmts: Stmt[]): Stmt[] {
    const enumConsts = new Set<string>();
    if (this.isEnum) {
      for (const f of this.cls.fields) {
        if ((f.access & Acc.Enum) !== 0 && (f.access & Acc.Static) !== 0) enumConsts.add(f.name);
      }
    }
    return stmts.filter((s) => {
      if (s.kind === 'expr' && s.expr.kind === 'assign-expr') {
        const t = s.expr.target;
        if (
          t.kind === 'field' &&
          (t.name === '$VALUES' ||
            t.name === '$ENUM$VALUES' ||
            t.name.startsWith('$SwitchMap') ||
            t.name.startsWith('$assertionsDisabled'))
        )
          return false;
        if (t.kind === 'field' && enumConsts.has(t.name)) return false;
      }
      return true;
    });
  },

  methodHeader(m: MethodInfo, sig: MethodSigInfo, rc: RenderCtx): string {
    const a = m.access;
    const mods: string[] = [];
    const isCtor = m.name === '<init>';
    if (isCtor && this.isEnum) {
    } else if (isCtor && this.isRecord) {
      if (a & Acc.Public) mods.push('public');
    } else {
      if (this.isInterface) {
        if (a & Acc.Abstract) {
        }
        if (a & Acc.Private) mods.push('private');
        if (a & Acc.Static) mods.push('static');
        if (!(a & Acc.Abstract) && !(a & Acc.Static) && !(a & Acc.Private) && m.code)
          mods.push('default');
      } else {
        if (a & Acc.Public) mods.push('public');
        if (a & Acc.Private) mods.push('private');
        if (a & Acc.Protected) mods.push('protected');
        if (a & Acc.Static) mods.push('static');
        if (a & Acc.Final && !isCtor) mods.push('final');
        if (a & Acc.Abstract) mods.push('abstract');
        if (a & Acc.Native) mods.push('native');
        if (a & Acc.Strict) mods.push('strictfp');
        if (a & 0x0020 && !isCtor) mods.push('synchronized');
      }
    }
    let header = mods.join(' ');
    if (sig.typeParams.length) {
      header += `${header ? ' ' : ''}<${sig.typeParams.map((tp) => typeParamStr(tp, (t) => typeStr(t, rc))).join(', ')}>`;
    }
    if (isCtor) {
      const local = this.localClasses.get(this.cls.name);
      const ic = this.cls.innerClasses.find((x) => x.inner === this.cls.name);
      const ctorName = !this.standalone
        ? (local?.simpleName ??
          ic?.innerName ??
          simpleOf(nestedDisplay(this.cls.name)).replace(/\$/g, '.'))
        : simpleOf(nestedDisplay(this.cls.name)).replace(/\$/g, '.');
      header += `${header ? ' ' : ''}${ctorName}`;
    } else {
      const ret = sig.ret;
      header += `${header ? ' ' : ''}${typeStr(ret, rc)} ${m.name}`;
    }
    const params = sig.params;
    header += `(${params
      .map((p, i) => {
        const t = p.varargs && p.type.kind === 'array' ? p.type.elem : p.type;
        const annotationOffset = Math.max(0, m.paramAnnotations.length - params.length);
        const annotations = (m.paramAnnotations[i + annotationOffset] ?? []).map((a) =>
          annotationStr(a, this),
        );
        return `${annotations.length ? annotations.join(' ') + ' ' : ''}${typeStr(t, rc)}${p.varargs ? '...' : ''} ${p.name}`;
      })
      .join(', ')})`;
    if (sig.thrown.length) {
      header += ` throws ${sig.thrown.map((t) => typeStr(t, rc)).join(', ')}`;
    }
    return header;
  },

  methodRenderCtx(m: MethodInfo, stmts?: Stmt[]): RenderCtx {
    const rc: RenderCtx = {
      ctx: this.ctx,
      className: this.cls.name,
      slotNames: new Map(),
      declared: new Set(),
      slotTypes: new Map(),
      refs: this.refs,
      nameResolver: this.nameResolver,
      lambdaResolver: (e) => resolveLambda(e, rc),
      scopes: [new Map()],
      anonClasses: this.anonClasses,
      localClasses: this.localClasses,
    };
    const sig = this.methodSignature(m);
    rc.returnType = sig.ret;
    sig.slots.forEach((slot, i) => {
      rc.slotNames.set(slot, sig.params[i].name);
      rc.declared.add(slot);
      rc.scopes[0].set(slot, sig.params[i].name);
      if (sig.params[i].type) rc.slotTypes.set(slot, sig.params[i].type);
    });
    for (const lv of m.code?.localVars ?? []) {
      if (!rc.slotNames.has(lv.index)) {
        rc.slotNames.set(lv.index, safeIdent(lv.name, `var${lv.index}`));
      }
      try {
        const t = parseFieldDescriptor(lv.descriptor);
        rc.slotTypes.set(lv.index, t);
      } catch {}
    }
    rc.slotLvtTypes = new Map();
    for (const lv of m.code?.localVars ?? []) {
      try {
        const t = parseFieldDescriptor(lv.descriptor);
        let list = rc.slotLvtTypes.get(lv.index);
        if (!list) rc.slotLvtTypes.set(lv.index, (list = []));
        if (!list.some((x) => JSON.stringify(x) === JSON.stringify(t))) list.push(t);
      } catch {}
    }
    for (const lv of m.code?.localVarTypes ?? []) {
      try {
        const sig2 = parseSignature(lv.descriptor);
        if (sig2 && 'kind' in sig2) {
          rc.slotTypes.set(lv.index, sig2 as never);
        }
      } catch {}
    }
    for (const slot of this.ctx.knownSlots(m)) {
      if (!rc.slotTypes.has(slot)) {
        const t = stmts ? declTypeOf(this.ctx, m, slot, stmts) : this.ctx.slotInferredType(m, slot);
        if (t) {
          rc.slotTypes.set(slot, t);
          if (!rc.slotNames.has(slot)) rc.slotNames.set(slot, `var${slot}`);
        }
      }
    }
    return rc;
  },

  constValueStr(f: FieldInfo): string | null {
    const cv = f.constantValue;
    if (!cv) return null;
    const t = parseFieldDescriptor(f.descriptor);
    const kind = t.kind === 'prim' ? t.name : cv.tag;
    return javaLiteral(kind, kind === 'boolean' ? cv.value === 1 : cv.value);
  },
};
