import { OutputLines } from '../budget.js';
import type { AnonInfo } from '../printer/context.js';
import {
  diagnosticStatus,
  type DecompileDiagnostic,
  type DecompileStatus,
} from '../diagnostics.js';
import { Acc, ClassFile, FieldInfo, MethodInfo } from '../../classfile/model.js';
import { JType, parseClassSignature, parseFieldDescriptor } from '../../classfile/types.js';
import { Ctx } from '../context.js';
import { nestedDisplay, simpleOf, typeStr, exprStr, RenderCtx } from '../printer/index.js';
import {
  MethodSigInfo,
  buildMethodSig,
  sigType,
  typeParamStr,
  ctorHasOuterParam,
} from './methodsig.js';
import { annotationStr } from './annotations.js';
import { anonPart } from './anon.js';
import { membersPart } from './members.js';

export { buildMethodSig } from './methodsig.js';
export { annotationStr } from './annotations.js';
export type { MethodSigInfo } from './methodsig.js';

export interface ClassSource {
  name: string;
  path: string;
  source: string;
  status: DecompileStatus;
  diagnostics: DecompileDiagnostic[];
  nestedIn?: string;
}

export function generateClass(
  ctx: Ctx,
  cls: ClassFile,
  standalone: boolean,
  nestedBodies: string[] = [],
  ownNested: Set<string> = new Set(),
): ClassSource {
  const gen = new ClassGenerator(ctx, cls, standalone, nestedBodies, ownNested);
  return gen.generate();
}

export class ClassGenerator {
  out: string[];
  refs = new Set<string>();
  nameResolver: (internal: string) => string = (n) => nestedDisplay(n);
  anonClasses = new Map<string, AnonInfo>();
  localClasses = new Map<string, { simpleName: string; dropFirstArg: boolean }>();
  isEnum = false;
  isInterface = false;
  isAnnotation = false;
  isRecord = false;
  methodSignatureCache = new Map<string, MethodSigInfo>();

  constructor(
    readonly ctx: Ctx,
    readonly cls: ClassFile,
    readonly standalone: boolean,
    readonly nestedBodies: string[] = [],
    readonly ownNested: Set<string> = new Set(),
  ) {
    this.out = new OutputLines(ctx.budget);
  }

  generate(): ClassSource {
    this.ctx.budget.check();
    const simple0 = this.cls.name.slice(
      Math.max(this.cls.name.lastIndexOf('/'), this.cls.name.lastIndexOf('$')) + 1,
    );
    if (/^\d+$/.test(simple0)) {
      this.ctx.diagnostics.add({
        code: 'MISSING_ENCLOSING_CLASS',
        severity: 'warning',
        stage: 'render',
        className: this.cls.name,
        message: 'Anonymous classes require their enclosing class for source generation',
      });
      return {
        name: this.cls.name,
        path: `_${simple0}.skip`,
        source: `/* anonymous class ${this.cls.name} requires enclosing class */\n`,
        status: 'partial',
        diagnostics: this.ctx.diagnostics.snapshot(),
      };
    }
    this.nameResolver = this.buildResolver();
    this.buildAnonInfo();
    this.nameResolver = (n) => nestedDisplay(n);
    this.renderBody();
    const imports = this.computeImports();
    this.out = new OutputLines(this.ctx.budget);

    this.nameResolver = this.buildResolver();
    this.refs = new Set();
    this.buildAnonInfo();
    const head = new OutputLines(this.ctx.budget);
    const pkg = this.cls.name.includes('/')
      ? this.cls.name.slice(0, this.cls.name.lastIndexOf('/')).replace(/\//g, '.')
      : '';
    if (this.standalone) {
      head.push(...this.bannerLines(), '');
      if (pkg) head.push(`package ${pkg};`, '');
      if (imports.length) head.push(...imports.map((i) => `import ${i};`), '');
    }
    this.renderBody();
    this.ctx.budget.previewOutput(
      [...head, ...this.out].reduce((sum, line) => sum + line.length + 1, 0),
    );
    let body = [...head, ...this.out].join('\n');
    if (this.nestedBodies.length) {
      const i = body.lastIndexOf('}');
      const indent = this.standalone ? '' : '    ';
      this.ctx.budget.previewOutput(
        body.length +
          this.nestedBodies.reduce(
            (sum, text) => sum + text.length + (indent.length + 4) * text.split('\n').length + 1,
            0,
          ),
      );
      const nestedText = this.nestedBodies
        .map((b) =>
          b
            .split('\n')
            .map((l) => (l ? indent + '    ' + l : l))
            .join('\n'),
        )
        .join('\n');
      body = body.slice(0, i) + nestedText + '\n' + indent + body.slice(i);
    }
    const source = body + '\n';
    this.ctx.budget.check();
    if (this.standalone) this.ctx.budget.outputChars(source.length);
    const simple = this.cls.name.slice(this.cls.name.lastIndexOf('/') + 1);
    return {
      name: this.cls.name,
      path: (pkg ? pkg.replace(/\./g, '/') + '/' : '') + simple.replace(/\$/g, '_') + '.java',
      source,
      status: diagnosticStatus(this.ctx.diagnostics.snapshot()),
      diagnostics: this.ctx.diagnostics.snapshot(),
    };
  }

  bannerLines(): string[] {
    const banner = this.ctx.opts.banner;
    if (banner === false) return [];
    const text = typeof banner === 'string' && banner.trim() ? banner.trim() : null;
    if (text) {
      return ['/*', ...text.split('\n').map((l) => ` * ${l}`.trimEnd()), ' */'];
    }
    return [
      '/*',
      ' * Decompiled with jar-analyzer jsd',
      ' *',
      ' * jsd: a pure JavaScript Java bytecode decompiler',
      ' */',
    ];
  }

  computeImports(): string[] {
    const bySimple = new Map<string, string[]>();
    for (const r of this.refs) {
      const display = nestedDisplay(r);
      const simple = simpleOf(display);
      if (/^\d+$/.test(simple)) continue;
      if (this.ownNested.has(r)) continue;
      if (this.localClasses.has(r)) continue;
      if (!bySimple.has(simple)) bySimple.set(simple, []);
      bySimple.get(simple)!.push(display);
    }
    const imports: string[] = [];
    for (const [simple, names] of bySimple) {
      const unique = [...new Set(names)];
      if (unique.length > 1) continue;
      const full = unique[0];
      if (full.startsWith('java.lang.') && !full.slice('java.lang.'.length).includes('.')) continue;
      const pkg = this.cls.name.includes('/')
        ? this.cls.name.slice(0, this.cls.name.lastIndexOf('/')).replace(/\//g, '.')
        : '';
      const importPkg = full.includes('.') ? full.slice(0, full.lastIndexOf('.')) : '';
      const typeIsNested =
        full.slice(pkg ? 0 : 0, full.lastIndexOf('.')).includes('.') &&
        !/[A-Z]/.test(full.slice(full.lastIndexOf('.') + 1));
      void typeIsNested;
      if (importPkg === pkg && !full.slice(pkg.length + 1).includes('.')) continue;
      if (full === nestedDisplay(this.cls.name)) continue;
      imports.push(full);
      void simple;
    }
    imports.sort();
    return imports;
  }

  buildResolver(): (internal: string) => string {
    const bySimple = new Map<string, Set<string>>();
    for (const r of this.refs) {
      const display = nestedDisplay(r);
      const simple = simpleOf(display);
      if (!bySimple.has(simple)) bySimple.set(simple, new Set());
      bySimple.get(simple)!.add(display);
    }
    const selfSimple = simpleOf(nestedDisplay(this.cls.name));
    void selfSimple;
    return (internal: string) => {
      const display = nestedDisplay(internal);
      this.refs.add(internal);
      const simple = simpleOf(display);
      if (/^\d+$/.test(simple)) return display;
      if (this.ownNested.has(internal)) return simple;
      const lc = this.localClasses.get(internal);
      if (lc) return lc.simpleName;
      const candidates = bySimple.get(simple);
      if (candidates && candidates.size > 1) return display;

      if (!this.standalone && display !== nestedDisplay(this.cls.name)) return display;
      if (display === nestedDisplay(this.cls.name)) return simple;
      const pkg = this.cls.name.includes('/')
        ? this.cls.name.slice(0, this.cls.name.lastIndexOf('/'))
        : '';
      if (
        pkg &&
        internal.startsWith(pkg + '/') &&
        !internal.slice(pkg.length + 1).includes('/') &&
        !internal.slice(pkg.length + 1).includes('$')
      ) {
        return simple;
      }
      return simple;
    };
  }

  renderBody(): void {
    this.renderClassAnnotations();
    const header = this.classHeader();
    this.out.push(header + ' {');
    this.renderMembers();
    this.renderDynamicConstants();
    this.out.push('}');
  }

  renderDynamicConstants(): void {
    for (const { name, handleName, params } of this.ctx.dynamicConcats.get(this.cls)?.values() ??
      []) {
      const declarations = params.map((type, i) => `${this.renderType(type)} arg${i}`).join(', ');
      const args = params.map((_, i) => `arg${i}`).join(', ');
      this.out.push(`
    private static java.lang.String ${name}(${declarations}) {
        try {
            return (java.lang.String) ${handleName}().invokeExact(${args});
        } catch (java.lang.RuntimeException | java.lang.Error error) {
            throw error;
        } catch (java.lang.Throwable error) {
            throw new java.lang.AssertionError(error);
        }
    }
`);
    }

    for (const { name, handleName, selector } of this.ctx.dynamicSwitches.get(this.cls)?.values() ??
      []) {
      this.out.push(`
    private static int ${name}(${this.renderType(selector)} value, int restart) {
        try {
            return (int) ${handleName}().invokeExact(value, restart);
        } catch (java.lang.RuntimeException | java.lang.Error error) {
            throw error;
        } catch (java.lang.Throwable error) {
            throw new java.lang.AssertionError(error);
        }
    }
`);
    }
    for (const { name, expr, type } of this.ctx.dynamicConstants.get(this.cls)?.values() ?? []) {
      const state = name + '$State';
      const t = this.renderType(type);
      const value = exprStr(expr, this.renderCtxForTypes());
      this.out.push(`
    ${this.isInterface ? '' : 'private static '}class ${state} {
        static java.lang.Object value;
        static java.lang.Error error;
        static boolean resolved;
    }
    private static ${t} ${name}() {
        synchronized (${state}.class) {
            if (${state}.error != null) throw ${state}.error;
            if (!${state}.resolved) {
                try {
                    ${state}.value = ${value};
                    ${state}.resolved = true;
                } catch (java.lang.Throwable cause) {
                    ${state}.error = cause instanceof java.lang.Error ? (java.lang.Error) cause : new java.lang.BootstrapMethodError(cause);
                    throw ${state}.error;
                }
            }
            return (${t}) ${state}.value;
        }
    }
`);
    }
  }

  classHeader(): string {
    let a = this.cls.access;
    const icSelf = this.cls.innerClasses.find((x) => x.inner === this.cls.name);
    if (icSelf && !this.standalone) a |= icSelf.access & 0x0008 ? 0x0008 : 0;
    if (!this.standalone && !icSelf?.outer && this.cls.enclosing) {
      const lc = this.cls.methods.find((mm) => mm.name === '<init>');
      if (!lc || !ctorHasOuterParam(this.cls, lc)) {
        a |= 0x0008;
      }
    }
    if (icSelf && !this.standalone && icSelf.access & 0x0002) a |= 0x0002;
    if (icSelf && !this.standalone && icSelf.access & 0x0004) a |= 0x0004;
    if (icSelf && !this.standalone && icSelf.access & 0x0001) a |= 0x0001;
    if (icSelf && !this.standalone && icSelf.access & 0x0010) a |= 0x0010;
    if (icSelf && !this.standalone && icSelf.access & 0x0400) a |= 0x0400;
    this.isEnum = (a & Acc.Enum) !== 0;
    this.isInterface = (a & Acc.Interface) !== 0;
    this.isAnnotation = (a & Acc.Annotation) !== 0;
    this.isRecord = this.cls.recordComponents.length > 0;
    const mods: string[] = [];
    const isEnumCls = (a & Acc.Enum) !== 0;
    if (a & Acc.Public) mods.push('public');
    if (a & Acc.Final && !isEnumCls) mods.push('final');
    if (a & Acc.Abstract) mods.push('abstract');
    if (a & Acc.Static && !this.standalone && !isEnumCls) mods.push('static');
    if (a & Acc.Strict) mods.push('strictfp');
    if (this.cls.permitted.length) mods.push('sealed');
    else if (
      !(a & Acc.Final) &&
      !isEnumCls &&
      !this.isRecord &&
      [this.cls.superName, ...this.cls.interfaces].some(
        (parent) => parent && this.ctx.lookup(parent)?.permitted.includes(this.cls.name),
      )
    )
      mods.push('non-sealed');
    const simple = simpleOf(nestedDisplay(this.cls.name));
    const displayName = this.memberName(simple);

    let header = mods.join(' ');
    if (this.isAnnotation) header += (header ? ' ' : '') + '@interface';
    else if (this.isInterface) header += (header ? ' ' : '') + 'interface';
    else if (this.isEnum) header += (header ? ' ' : '') + 'enum';
    else if (this.isRecord) header += (header ? ' ' : '') + 'record';
    else header += (header ? ' ' : '') + 'class';
    header += ` ${displayName}`;

    let sig: ReturnType<typeof parseClassSignature> | undefined;
    if (this.cls.signature) {
      try {
        sig = parseClassSignature(this.cls.signature);
      } catch {}
    }
    if (sig && 'typeParams' in sig && sig.typeParams.length) {
      header += `<${sig.typeParams.map((tp) => typeParamStr(tp, (t) => this.renderType(t))).join(', ')}>`;
    }

    if (this.isRecord) {
      const comps = this.cls.recordComponents.map((c) => {
        const t = sigType(c.signature) ?? parseFieldDescriptor(c.descriptor);
        return `${this.renderType(t)} ${c.name}`;
      });
      header += `(${comps.join(', ')})`;
    }

    const superName = this.cls.superName;
    if (
      !this.isEnum &&
      !this.isRecord &&
      !this.isInterface &&
      superName &&
      superName !== 'java/lang/Object'
    ) {
      header += ` extends ${sig ? this.renderType(sig.superType) : this.resolve(superName)}`;
    }
    if (this.isInterface && superName && superName !== 'java/lang/Object') {
    }
    const ifaces = this.cls.interfaces.filter((i) => i !== 'java/lang/annotation/Annotation');
    if (ifaces.length) {
      const kw = this.isInterface ? ' extends' : ' implements';
      header +=
        kw +
        ' ' +
        ifaces
          .map((i) => {
            const type = sig?.interfaces.find((t) => t.kind === 'class' && t.name === i);
            return type ? this.renderType(type) : this.resolve(i);
          })
          .join(', ');
    }
    if (this.cls.permitted.length) {
      header += ' permits ' + this.cls.permitted.map((i) => this.resolve(i)).join(', ');
    }
    return header;
  }

  memberName(simple: string): string {
    const local = this.localClasses.get(this.cls.name);
    if (local && !this.standalone) return local.simpleName;
    const ic = this.cls.innerClasses.find((x) => x.inner === this.cls.name);
    if (!this.standalone && ic?.innerName) return ic.innerName;
    if (ic?.outer && ic.innerName && ic.innerName.includes('$'))
      return ic.innerName.replace(/\$/g, '.');
    return ic?.innerName ?? simple;
  }

  renderType(t: JType): string {
    return typeStr(t, this.renderCtxForTypes());
  }

  renderCtxForTypes(): RenderCtx {
    return {
      ctx: this.ctx,
      className: this.cls.name,
      slotNames: new Map(),
      declared: new Set(),
      slotTypes: new Map(),
      refs: this.refs,
      nameResolver: this.nameResolver,
      scopes: [new Map()],
    };
  }

  resolve(internal: string): string {
    this.refs.add(internal);
    return this.nameResolver(internal);
  }

  renderClassAnnotations(): void {
    for (const ann of this.cls.annotations) {
      this.out.push(annotationStr(ann, this));
    }
  }

  methodSignature(m: MethodInfo): MethodSigInfo {
    const cached = this.methodSignatureCache.get(m.name + m.descriptor);
    if (cached) return cached;
    const info = buildMethodSig(this.ctx, this.cls, m);
    this.methodSignatureCache.set(m.name + m.descriptor, info);
    return info;
  }
}

export interface ClassGenerator {
  buildAnonInfo(): void;
  methodRenderCtxFor(cf: ClassFile, mm: MethodInfo): RenderCtx;
  methodHeaderFor(cf: ClassFile, mm: MethodInfo, rc: RenderCtx): string;
  renderMembers(): void;
  renderField(f: FieldInfo): void;
  shouldSkipMethod(m: MethodInfo): boolean;
  renderMethod(m: MethodInfo): void;
  enumConstantArgs(): Map<string, string>;
  filterClinit(stmts: import('../../ast/ast.js').Stmt[]): import('../../ast/ast.js').Stmt[];
  methodHeader(m: MethodInfo, sig: MethodSigInfo, rc: RenderCtx): string;
  methodRenderCtx(m: MethodInfo, stmts?: import('../../ast/ast.js').Stmt[]): RenderCtx;
  constValueStr(f: FieldInfo): string | null;
}

Object.assign(ClassGenerator.prototype, anonPart, membersPart);
