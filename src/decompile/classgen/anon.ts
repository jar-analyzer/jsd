import { errorMessage } from '../diagnostics.js';
import { ClassFile, MethodInfo } from '../../classfile/model.js';
import { JType, parseFieldDescriptor } from '../../classfile/types.js';
import { decodeBytecode } from '../../bytecode/decode.js';
import { resolveLambda } from '../lambdas.js';
import { decompileMethod } from '../method.js';
import { RenderCtx, renderStmtsHeader, typeStr } from '../printer/index.js';
import { buildMethodSig, ctorHasOuterParam, safeSig } from './methodsig.js';
import type { ClassGenerator } from './index.js';

export const anonPart: ThisType<ClassGenerator> &
  Pick<ClassGenerator, 'buildAnonInfo' | 'methodRenderCtxFor' | 'methodHeaderFor'> = {
  buildAnonInfo(): void {
    const enclosing = this.cls.name;
    for (const [name, cf] of this.ctx.classes) {
      const simple = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('$')) + 1);
      if (!/^\d+$/.test(simple)) continue;
      const enclosingAttr = cf.enclosing?.class;
      if (enclosingAttr !== enclosing && !name.startsWith(enclosing + '$')) continue;
      let superInternal = cf.interfaces[0] ?? cf.superName ?? 'java/lang/Object';
      if (superInternal === 'java/lang/Object' && cf.interfaces.length > 0)
        superInternal = cf.interfaces[0];
      const ctor = cf.methods.find((mm) => mm.name === '<init>');
      const dropFirstArg = ctor ? ctorHasOuterParam(cf, ctor) : false;
      const lines: string[] = [];
      for (const f of cf.fields) {
        if (f.synthetic || /^this\$\d+$/.test(f.name)) continue;
        const t = f.signature
          ? (safeSig(f.signature) as never)
          : parseFieldDescriptor(f.descriptor);
        lines.push('');
        lines.push(
          `    private ${typeStr((t as JType) ?? parseFieldDescriptor(f.descriptor), this.renderCtxForTypes())} ${f.name};`,
        );
      }
      for (const mm of cf.methods) {
        if (mm.name === '<init>' || mm.synthetic || (mm.access & 0x0040) !== 0) continue;
        if (
          (mm.access & 0x1000) !== 0 &&
          (mm.name.startsWith('access$') || mm.name.startsWith('lambda$'))
        )
          continue;
        const body = decompileMethod(this.ctx, cf, mm);
        if (!body || body.failed) continue;
        const mrc = this.methodRenderCtxFor(cf, mm);
        mrc.scopes.push(new Map());
        try {
          const header = this.methodHeaderFor(cf, mm, mrc);
          lines.push('');
          if (header) lines.push(...renderStmtsHeader(header, body.stmts, mrc));
        } catch (e) {
          this.ctx.diagnostics.add({
            code: 'ANONYMOUS_METHOD_RENDER_FAILED',
            severity: 'error',
            stage: 'render',
            className: cf.name,
            methodName: mm.name,
            descriptor: mm.descriptor,
            message: errorMessage(e),
          });
        }
      }
      const superCls = this.ctx.lookup(superInternal);
      const noCtorArgs =
        superInternal !== cf.superName &&
        (superCls
          ? (superCls.access & 0x0200) !== 0
          : superInternal.startsWith('java/')
            ? false
            : true);
      const captureFields: { name: string; slot: number }[] = [];
      if (noCtorArgs && ctor?.code) {
        try {
          const ins = decodeBytecode(ctor.code.code);
          for (let i = 2; i < ins.length; i++) {
            const a = ins[i - 2],
              b = ins[i - 1],
              c = ins[i];
            if (a.name !== 'aload_0' || c.name !== 'putfield' || c.cpIndex === undefined) continue;
            let resolved: string | null = null;
            try {
              resolved = cf.cp.memberRef(c.cpIndex).name;
            } catch {
              resolved = null;
            }
            if (!resolved || !resolved.startsWith('val$')) continue;
            let slotNum = -1;
            const loadName = b.name;
            if (
              loadName === 'iload' ||
              loadName === 'aload' ||
              loadName === 'lload' ||
              loadName === 'fload' ||
              loadName === 'dload'
            )
              slotNum = b.local ?? -1;
            else if (/^(i|a|l|f|d)load_\d$/.test(loadName)) slotNum = Number(loadName.slice(-1));
            if (slotNum < 2) continue;
            captureFields.push({ name: resolved, slot: slotNum });
          }
        } catch {}
      }
      this.anonClasses.set(name, {
        superInternal,
        dropFirstArg,
        noCtorArgs,
        captureFields,
        memberLines: lines,
      });
    }
    for (const [name, cf] of this.ctx.classes) {
      const dollar = name.lastIndexOf('$');
      if (dollar <= name.lastIndexOf('/')) continue;
      const simple = name.slice(dollar + 1);
      if (!/^\d+[A-Za-z]/.test(simple)) continue;
      if (!name.startsWith(enclosing + '$')) continue;
      const innerName = simple.replace(/^\d+/, '');
      const lctor = cf.methods.find((mm) => mm.name === '<init>');
      const hasOuterRef = lctor
        ? ctorHasOuterParam(cf, lctor)
        : cf.fields.some((f) => f.name === 'this$0');
      this.localClasses.set(name, { simpleName: innerName, dropFirstArg: hasOuterRef });
    }
  },

  methodRenderCtxFor(cf: ClassFile, mm: MethodInfo): RenderCtx {
    const rc: RenderCtx = {
      ctx: this.ctx,
      className: cf.name,
      slotNames: new Map(),
      declared: new Set(),
      slotTypes: new Map(),
      refs: this.refs,
      nameResolver: this.nameResolver,
      lambdaResolver: (e) => resolveLambda(e, rc),
      scopes: [new Map()],
      localClasses: this.localClasses,
    };
    const sig = buildMethodSig(this.ctx, cf, mm);
    rc.returnType = sig.ret;
    sig.slots.forEach((slot, i) => {
      rc.slotNames.set(slot, sig.params[i].name);
      rc.declared.add(slot);
      rc.scopes[0].set(slot, sig.params[i].name);
      if (sig.params[i].type) rc.slotTypes.set(slot, sig.params[i].type);
    });
    for (const lv of mm.code?.localVars ?? []) {
      if (!rc.slotNames.has(lv.index)) rc.slotNames.set(lv.index, lv.name);
      try {
        rc.slotTypes.set(lv.index, parseFieldDescriptor(lv.descriptor));
      } catch {}
    }
    return rc;
  },

  methodHeaderFor(cf: ClassFile, mm: MethodInfo, rc: RenderCtx): string {
    const sig = buildMethodSig(this.ctx, cf, mm);
    const mods: string[] = [];
    if (mm.access & 0x0001) mods.push('public');
    if (mm.access & 0x0010 && mm.name !== '<init>') mods.push('final');
    if (
      cf.access & 0x0200 &&
      !(mm.access & 0x0400) &&
      !(mm.access & 0x0008) &&
      !(mm.access & 0x0002)
    )
      mods.push('default');
    let header = mods.join(' ');
    const ret = sig.ret;
    header += `${header ? ' ' : ''}${typeStr(ret, rc)} ${mm.name}`;
    header += `(${sig.params.map((p) => `${typeStr(p.type, rc)}${p.varargs ? '...' : ''} ${p.name}`).join(', ')})`;
    if (sig.thrown.length) header += ` throws ${sig.thrown.map((t) => typeStr(t, rc)).join(', ')}`;
    return header;
  },
};
