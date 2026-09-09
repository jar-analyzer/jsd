import { DecompileLimitError } from '../budget.js';
import { errorMessage } from '../diagnostics.js';
import { Acc, ClassFile, MethodInfo } from '../../classfile/model.js';
import { JType, parseFieldDescriptor, parseMethodDescriptor } from '../../classfile/types.js';
import { Expr, Stmt, walkStmt } from '../../ast/ast.js';
import { resolveLambda } from '../lambdas.js';
import { decompileMethod } from '../method.js';
import { RenderCtx, renderStmts, renderStmtsHeader, typeStr } from '../printer/index.js';
import { buildMethodSig, ctorHasOuterParam, safeSig } from './methodsig.js';
import type { ClassGenerator } from './index.js';

function renderInitializer(stmts: Stmt[], rc: RenderCtx, isStatic: boolean): string[] {
  const body = structuredClone(stmts);
  const labels = new Set<string>();
  let hasReturn = false;
  for (const stmt of body)
    walkStmt(stmt, (node) => {
      if ('label' in node && node.label) labels.add(node.label);
      if (node.kind === 'return') hasReturn = true;
    });
  const opening = isStatic ? 'static {' : '{';
  if (!hasReturn) return ['', opening, ...renderStmts(body, rc, 1), '}'];
  let label = 'initialize';
  while (labels.has(label)) label += '$';
  for (const stmt of body)
    walkStmt(stmt, (node) => {
      if (node.kind === 'return') Object.assign(node, { kind: 'break', label });
    });
  return ['', opening, `    ${label}: {`, ...renderStmts(body, rc, 2), '    }', '}'];
}

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
      if (!ctor && cf.access & Acc.Synthetic) continue;
      const dropFirstArg = ctor ? ctorHasOuterParam(cf, ctor) : false;
      const captureFields: { name: string; index: number; type: JType }[] = [];
      const superArgIndices: number[] = [];
      const ctorBody = ctor ? decompileMethod(this.ctx, cf, ctor) : null;
      const slots = new Map<number, number>();
      let slot = 1;
      for (const [index, type] of (ctor
        ? parseMethodDescriptor(ctor.descriptor).params
        : []
      ).entries()) {
        slots.set(slot, index);
        slot += type.kind === 'prim' && ['long', 'double'].includes(type.name) ? 2 : 1;
      }
      const initializers: Stmt[] = [];
      if (!ctorBody || ctorBody.failed)
        throw new Error(`Anonymous constructor could not be restored: ${cf.name}`);
      let beforeSuper = true;
      for (const stmt of ctorBody.stmts) {
        if (stmt.kind === 'return' && !stmt.expr) continue;
        if (stmt.kind === 'expr') {
          const expr = stmt.expr;
          if (
            beforeSuper &&
            dropFirstArg &&
            expr.kind === 'invoke' &&
            expr.mode === 'static' &&
            expr.owner === 'java/util/Objects' &&
            expr.name === 'requireNonNull' &&
            expr.descriptor === '(Ljava/lang/Object;)Ljava/lang/Object;' &&
            expr.args.length === 1 &&
            expr.args[0].kind === 'local' &&
            expr.args[0].slot === 1
          )
            continue;
          if (expr.kind === 'invoke' && expr.name === '<init>' && expr.superCall) {
            beforeSuper = false;
            for (const arg of expr.args) {
              if (arg.kind !== 'local' || !slots.has(arg.slot))
                throw new Error(`Unsupported anonymous superclass argument: ${cf.name}`);
              superArgIndices.push(slots.get(arg.slot)!);
            }
            continue;
          }
          if (
            expr.kind === 'assign-expr' &&
            expr.target.kind === 'field' &&
            expr.target.owner === cf.name &&
            expr.target.target?.kind === 'this'
          ) {
            const target = expr.target;
            const field = cf.fields.find((f) => f.name === target.name);
            if (
              field &&
              (field.synthetic || field.access & Acc.Synthetic) &&
              expr.expr.kind === 'local' &&
              slots.has(expr.expr.slot)
            ) {
              if (!field.name.startsWith('this$'))
                captureFields.push({
                  name: field.name,
                  index: slots.get(expr.expr.slot)!,
                  type: parseFieldDescriptor(field.descriptor),
                });
              continue;
            }
          }
        }
        initializers.push(stmt);
      }
      const renderMembers = (captureValues: ReadonlyMap<string, Expr>): string[] => {
        const lines: string[] = [];
        const bodyInitializers = structuredClone(initializers);
        for (const f of cf.fields) {
          if (
            captureFields.some((capture) => capture.name === f.name) ||
            f.synthetic ||
            f.access & Acc.Synthetic
          )
            continue;
          const t = f.signature ? safeSig(f.signature) : null;
          const mods = [
            [Acc.Public, 'public'],
            [Acc.Private, 'private'],
            [Acc.Protected, 'protected'],
            [Acc.Static, 'static'],
            [Acc.Final, 'final'],
            [Acc.Volatile, 'volatile'],
            [Acc.Transient, 'transient'],
          ] as const;
          const prefix = mods
            .filter(([flag]) => f.access & flag)
            .map(([, text]) => text)
            .join(' ');
          const constant = f.access & Acc.Static && f.constantValue ? this.constValueStr(f) : null;
          lines.push(
            '',
            `${prefix ? prefix + ' ' : ''}${typeStr(t && 'kind' in t ? t : parseFieldDescriptor(f.descriptor), this.renderCtxForTypes())} ${f.name}${constant !== null ? ' = ' + constant : ''};`,
          );
        }
        if (bodyInitializers.length && ctor) {
          const rc = this.methodRenderCtxFor(cf, ctor);
          rc.fieldValues = captureValues;
          lines.push(...renderInitializer(bodyInitializers, rc, false));
        }
        for (const mm of cf.methods) {
          if (mm.name === '<clinit>') {
            const body = decompileMethod(this.ctx, cf, mm);
            if (body?.failed) throw new Error(body.failed);
            const stmts = body?.stmts.filter((s) => s.kind !== 'return') ?? [];
            if (stmts.length)
              lines.push(...renderInitializer(stmts, this.methodRenderCtxFor(cf, mm), true));
            continue;
          }
          if (mm.name === '<init>' || mm.synthetic || (mm.access & 0x0040) !== 0) continue;
          if (
            (mm.access & 0x1000) !== 0 &&
            (mm.name.startsWith('access$') || mm.name.startsWith('lambda$'))
          )
            continue;
          const body = decompileMethod(this.ctx, cf, mm);
          if (!body || body.failed) continue;
          const mrc = this.methodRenderCtxFor(cf, mm);
          mrc.fieldValues = captureValues;
          mrc.scopes.push(new Map());
          try {
            const header = this.methodHeaderFor(cf, mm, mrc);
            lines.push('');
            if (header) lines.push(...renderStmtsHeader(header, body.stmts, mrc));
          } catch (e) {
            if (e instanceof DecompileLimitError) throw e;
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
        return lines;
      };
      this.anonClasses.set(name, {
        superInternal,
        dropFirstArg,
        captureFields,
        superArgIndices,
        renderMembers,
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
    if (mm.access & Acc.Synchronized) mods.push('synchronized');
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
