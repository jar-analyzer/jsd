import type { Expr } from '../ast/ast.js';
import { WorkBudget } from './budget.js';
import { DiagnosticBag } from './diagnostics.js';
import type { ClassFile, MethodInfo } from '../classfile/model.js';
import type { JType } from '../classfile/types.js';
import { parseFieldDescriptor, parseMethodDescriptor, parseSignature } from '../classfile/types.js';
import type { LocalVarEntry } from '../classfile/model.js';

export interface DecompileOptions {
  maxInputBytes?: number;
  maxTotalInputBytes?: number;
  maxClasses?: number;
  maxWork?: number;
  maxOutputChars?: number;
  timeoutMs?: number;
  signal?: { readonly aborted: boolean };
  showSynthetic?: boolean;
  lineNumbers?: boolean;
  fallbackDisasm?: boolean;
  banner?: boolean | string;
}

export const JAVA_KEYWORDS = new Set([
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'try',
  'void',
  'volatile',
  'while',
  'true',
  'false',
  'null',
  'var',
  'record',
  'yield',
  'sealed',
  'permits',
  'non-sealed',
]);

export class Ctx {
  readonly dynamicConcats = new Map<
    ClassFile,
    Map<string, { name: string; handleName: string; params: JType[] }>
  >();
  readonly dynamicSwitches = new Map<
    ClassFile,
    Map<number, { name: string; handleName: string; selector: JType }>
  >();
  readonly dynamicConstants = new Map<
    ClassFile,
    Map<number | string, { name: string; expr: Expr; type: JType }>
  >();
  readonly classes: Map<string, ClassFile>;
  readonly opts: DecompileOptions;
  private typeRevisions = new Map<MethodInfo, number>();
  private slotTypesByMethod = new Map<MethodInfo, Map<number, Set<JType>>>();

  constructor(
    cls: ClassFile,
    all: Map<string, ClassFile>,
    opts: DecompileOptions = {},
    readonly diagnostics = new DiagnosticBag(),
    readonly budget = new WorkBudget(opts),
  ) {
    this.classes = all;
    this.opts = opts;
    if (!this.classes.has(cls.name)) this.classes.set(cls.name, cls);
  }

  lookup(name: string): ClassFile | undefined {
    return this.classes.get(name);
  }

  fieldTypeInfo(owner: string, name: string): JType | undefined {
    let c = this.lookup(owner);
    let guard = 0;
    while (c && guard++ < 50) {
      const f = c.fields.find((x) => x.name === name);
      if (f) {
        try {
          return parseFieldDescriptor(f.descriptor);
        } catch {
          return undefined;
        }
      }
      c = c.superName ? this.lookup(c.superName) : undefined;
    }
    return undefined;
  }

  methodInfo(
    owner: string,
    name: string,
    descriptor: string,
  ): { cls: ClassFile; m: MethodInfo } | undefined {
    const visit = (
      cn: string | undefined,
      depth: number,
    ): { cls: ClassFile; m: MethodInfo } | undefined => {
      if (!cn || depth > 60) return undefined;
      const c = this.lookup(cn);
      if (!c) return undefined;
      const m = c.methods.find((x) => x.name === name && x.descriptor === descriptor);
      if (m) return { cls: c, m };
      for (const i of c.interfaces) {
        const r = visit(i, depth + 1);
        if (r) return r;
      }
      return visit(c.superName ?? undefined, depth + 1);
    };
    return visit(owner, 0);
  }

  recordSlotType(m: MethodInfo, slot: number, t: JType | undefined): void {
    if (!t) return;
    let perMethod = this.slotTypesByMethod.get(m);
    if (!perMethod) this.slotTypesByMethod.set(m, (perMethod = new Map()));
    let set = perMethod.get(slot);
    if (!set) perMethod.set(slot, (set = new Set()));
    if ([...set].some((existing) => typeKey(existing) === typeKey(t))) return;
    set.add(t);
    this.typeRevisions.set(m, this.slotTypeRevision(m) + 1);
  }

  slotTypeRevision(m: MethodInfo): number {
    return this.typeRevisions.get(m) ?? 0;
  }

  knownSlots(m: MethodInfo): number[] {
    return [...(this.slotTypesByMethod.get(m)?.keys() ?? [])];
  }

  slotInferredType(m: MethodInfo, slot: number): JType | undefined {
    const set = this.slotTypesByMethod.get(m)?.get(slot);
    if (!set || set.size === 0) return undefined;
    const list = [...set];
    const same = list.every((t) => typeKey(t) === typeKey(list[0]));
    if (same) {
      const type = list[0];
      if (type.kind === 'class' && /\$\d+$/.test(type.name)) {
        const cls = this.lookup(type.name);
        const name =
          cls?.superName && cls.superName !== 'java/lang/Object'
            ? cls.superName
            : (cls?.interfaces[0] ?? 'java/lang/Object');
        return { kind: 'class', name };
      }
      return type;
    }
    if (
      list.every(
        (t) => t.kind === 'prim' && ['int', 'boolean', 'char', 'short', 'byte'].includes(t.name),
      )
    ) {
      return { kind: 'prim', name: 'int' };
    }
    if (list.every((t) => t.kind === 'class')) return { kind: 'class', name: 'java/lang/Object' };
    return undefined;
  }

  lvtEntry(m: MethodInfo, slot: number, pc: number) {
    let best: { name: string; descriptor: string } | undefined;
    let bestLen = -1;
    for (const e of m.code?.localVars ?? []) {
      if (e.index === slot && pc >= e.start && pc < e.start + e.length) {
        if (best === undefined || e.length < bestLen) {
          best = { name: e.name, descriptor: e.descriptor };
          bestLen = e.length;
        }
      }
    }
    if (!best) {
      let after = -1;
      let before = -1;
      for (const e of m.code?.localVars ?? []) {
        if (e.index !== slot) continue;
        if (e.start >= pc && (after === -1 || e.start < after)) {
          if (e.start - pc <= 4) after = e.start;
        }
        if (e.start <= pc && e.start >= before) before = e.start;
      }
      let picked: { name: string; descriptor: string } | undefined;
      for (const e of m.code?.localVars ?? []) {
        if (e.index === slot && (e.start === after || e.start === before)) {
          picked = { name: e.name, descriptor: e.descriptor };
          if (e.start === after) break;
        }
      }
      best = picked;
    }
    return best;
  }

  static sanitizeName(n: string | undefined, fallback: string): string {
    if (!n || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n) || JAVA_KEYWORDS.has(n)) return fallback;
    return n;
  }

  slotName(m: MethodInfo, slot: number, pc: number, isThis: boolean): string {
    if (isThis && slot === 0) return 'this';
    const e = this.lvtEntry(m, slot, pc);
    return Ctx.sanitizeName(e?.name, `var${slot}`);
  }

  slotType(m: MethodInfo, slot: number, pc: number): JType | undefined {
    let best: LocalVarEntry | undefined;
    let bestLen = Infinity;
    for (const e of m.code?.localVars ?? []) {
      if (e.index !== slot) continue;
      const covers = pc >= e.start && pc < e.start + e.length;
      const declBoundary = e.start >= pc && e.start - pc <= 4;
      if ((covers || declBoundary) && e.length < bestLen) {
        best = e;
        bestLen = e.length;
      }
    }
    if (!best) {
      if (m.code?.localVars.length) return undefined;
      let index = m.access & 0x0008 ? 0 : 1;
      for (const type of parseMethodDescriptor(m.descriptor).params) {
        if (index === slot) return type;
        index += type.kind === 'prim' && (type.name === 'long' || type.name === 'double') ? 2 : 1;
      }
      return this.slotInferredType(m, slot);
    }
    try {
      return parseFieldDescriptor(best.descriptor);
    } catch {
      return undefined;
    }
  }

  slotTypeGeneric(m: MethodInfo, slot: number, pc: number): JType | undefined {
    let best: { name: string; descriptor: string } | undefined;
    let bestLen = Infinity;
    for (const e of m.code?.localVarTypes ?? []) {
      if (e.index === slot && pc >= e.start && pc < e.start + e.length && e.length < bestLen) {
        best = { name: e.name, descriptor: e.descriptor };
        bestLen = e.length;
      }
    }
    if (!best) {
      let bestStart = -1;
      for (const e of m.code?.localVarTypes ?? []) {
        if (e.index === slot && e.start >= pc && e.start - pc <= 4 && e.start >= bestStart) {
          best = { name: e.name, descriptor: e.descriptor };
          bestStart = e.start;
        }
      }
    }
    if (best) {
      try {
        const sig = parseSignature(best.descriptor);
        if (sig && 'kind' in sig) return sig;
      } catch {}
    }
    if (!m.code?.localVars.length && m.signature) {
      const signature = parseSignature(m.signature);
      const raw = parseMethodDescriptor(m.descriptor);
      if (!('kind' in signature) && signature.params.length === raw.params.length) {
        let index = m.access & 0x0008 ? 0 : 1;
        for (let i = 0; i < raw.params.length; i++) {
          if (index === slot) return signature.params[i];
          const type = raw.params[i];
          index += type.kind === 'prim' && (type.name === 'long' || type.name === 'double') ? 2 : 1;
        }
      }
    }
    return this.slotType(m, slot, pc);
  }
}

export function typeKey(t: JType): string {
  switch (t.kind) {
    case 'prim':
      return t.name;
    case 'typevar':
      return 'T:' + t.name;
    case 'wildcard':
      return '?';
    case 'array':
      return '[' + typeKey(t.elem);
    case 'class':
      return t.name + (t.args ? '<' + t.args.map(typeKey).join(',') + '>' : '');
  }
}
