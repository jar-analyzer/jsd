export type { JavaFormatOptions } from './decompile/format/index.js';
import { WorkBudget, DecompileLimitError } from './decompile/budget.js';
export { DecompileLimitError } from './decompile/budget.js';
import { parseClass } from './classfile/parser.js';
import { enclosingClass, isAnonymousClass } from './classfile/names.js';
import type { ClassFile } from './classfile/model.js';
import { Ctx, DecompileOptions } from './decompile/context.js';
import { generateClass, ClassSource } from './decompile/classgen/index.js';
import {
  DiagnosticBag,
  diagnosticStatus,
  errorMessage,
  type DecompileDiagnostic,
  type DecompileStatus,
} from './decompile/diagnostics.js';

export type { DecompileOptions, ClassSource };
export type {
  DecompileDiagnostic,
  DecompileStatus,
  DiagnosticCode,
  DiagnosticStage,
} from './decompile/diagnostics.js';

export interface DecompileReport {
  sources: ClassSource[];
  status: DecompileStatus;
  diagnostics: DecompileDiagnostic[];
}

export interface Decompiler {
  addClass(data: Uint8Array): ClassFile;
  addClasses(map: Map<string, Uint8Array>): void;
  decompileAll(): ClassSource[];
  decompileAllDetailed(): DecompileReport;
  getDiagnostics(): DecompileDiagnostic[];
}

export function createDecompiler(options: DecompileOptions = {}): Decompiler {
  new WorkBudget(options);
  const classes = new Map<string, ClassFile>();
  const inputClasses = new Map<string, ClassFile>();
  const loadErrors = new Map<string, DecompileDiagnostic>();
  const loadWarnings = new Map<string, DecompileDiagnostic>();
  const inputSizes = new Map<ClassFile, number>();
  let totalInputBytes = 0;
  let lastDiagnostics: DecompileDiagnostic[] = [];

  const remove = (cf: ClassFile): void => {
    if (classes.get(cf.name) !== cf) return;
    classes.delete(cf.name);
    for (const [name, input] of inputClasses) if (input === cf) inputClasses.delete(name);
    totalInputBytes -= inputSizes.get(cf) ?? 0;
    inputSizes.delete(cf);
  };
  const load = (data: Uint8Array, inputName?: string): ClassFile => {
    const budget = new WorkBudget(options);
    budget.input(data.byteLength);
    const cf = parseClass(data, (name) => {
      const previous = classes.get(name);
      budget.inputs(
        totalInputBytes - (previous ? (inputSizes.get(previous) ?? 0) : 0) + data.byteLength,
        classes.size + (previous ? 0 : 1),
      );
    });
    const previous = classes.get(cf.name);
    if (previous) {
      const previousInput = [...inputClasses].find(([, input]) => input === previous)?.[0];
      loadWarnings.set(cf.name, {
        code: 'DUPLICATE_CLASS',
        severity: 'warning',
        stage: 'parse',
        className: cf.name,
        inputName,
        message: `Duplicate class ${cf.name}: ${inputName ?? 'addClass input'} replaces ${previousInput ?? 'a previously loaded class'}`,
      });
    }
    if (previous) remove(previous);
    classes.set(cf.name, cf);
    inputSizes.set(cf, data.byteLength);
    totalInputBytes += data.byteLength;
    return cf;
  };

  const decompileAllDetailed = (): DecompileReport => {
    const budget = new WorkBudget(options);
    const out: ClassSource[] = [];
    const allDiagnostics = new DiagnosticBag();
    for (const diagnostic of loadErrors.values()) allDiagnostics.add(diagnostic);
    for (const diagnostic of loadWarnings.values()) allDiagnostics.add(diagnostic);
    const children = new Map<string, ClassFile[]>();
    const topLevel: ClassFile[] = [];
    for (const cls of classes.values()) {
      if (shouldSkip(cls)) {
        allDiagnostics.add({
          code: 'CLASS_SKIPPED',
          severity: 'info',
          stage: 'render',
          className: cls.name,
          message: 'Module descriptors are not emitted as Java classes',
        });
        continue;
      }
      const enclosing = enclosingClass(cls);
      if (isAnonymousClass(cls)) {
        if (!enclosing || !classes.has(enclosing))
          allDiagnostics.add({
            code: 'MISSING_ENCLOSING_CLASS',
            severity: 'warning',
            stage: 'render',
            className: cls.name,
            message: `Missing enclosing class ${enclosing}`,
          });
        continue;
      }
      if (enclosing && classes.has(enclosing)) {
        let list = children.get(enclosing);
        if (!list) children.set(enclosing, (list = []));
        list.push(cls);
      } else topLevel.push(cls);
    }
    const collectOwn = (cls: ClassFile, acc: Set<string>): void => {
      budget.check(1);
      for (const child of children.get(cls.name) ?? []) {
        if (acc.has(child.name)) throw new Error(`Cyclic inner class relationship: ${child.name}`);
        acc.add(child.name);
        collectOwn(child, acc);
      }
    };
    const reachable = new Set<string>();
    const render = (
      cls: ClassFile,
      standalone: boolean,
      diagnostics: DiagnosticBag,
    ): ClassSource => {
      const own = new Set<string>();
      collectOwn(cls, own);
      reachable.add(cls.name);
      for (const name of own) reachable.add(name);
      const nested: string[] = [];
      let nestedChars = 0;
      for (const child of children.get(cls.name) ?? []) {
        const source = render(child, false, diagnostics).source;
        nestedChars += source.length;
        budget.previewOutput(nestedChars);
        nested.push(source);
      }
      const ctx = new Ctx(cls, classes, options, diagnostics, budget);
      return generateClass(ctx, cls, standalone, nested, own);
    };
    for (const cls of topLevel) {
      const diagnostics = new DiagnosticBag();
      try {
        out.push(render(cls, true, diagnostics));
      } catch (error) {
        diagnostics.add({
          code: error instanceof DecompileLimitError ? error.code : 'CLASS_RENDER_FAILED',
          severity: 'error',
          stage: 'render',
          className: cls.name,
          message: errorMessage(error),
        });
      }
      for (const diagnostic of diagnostics.snapshot()) allDiagnostics.add(diagnostic);
    }

    for (const list of children.values()) {
      for (const cls of list) {
        if (!reachable.has(cls.name))
          allDiagnostics.add({
            code: 'CLASS_RENDER_FAILED',
            severity: 'error',
            stage: 'render',
            className: cls.name,
            message:
              'Inner class is not reachable from a top-level class (cyclic enclosing relationships)',
          });
      }
    }
    lastDiagnostics = allDiagnostics.snapshot();
    return {
      sources: out,
      status: diagnosticStatus(lastDiagnostics, out.length > 0),
      diagnostics: lastDiagnostics.map((d) => ({ ...d })),
    };
  };

  return {
    addClass(data) {
      const cf = load(data);
      lastDiagnostics = [];
      return cf;
    },
    addClasses(map) {
      lastDiagnostics = [];
      for (const [name, data] of map) {
        const previous = inputClasses.get(name);
        if (previous) {
          remove(previous);
          loadWarnings.delete(previous.name);
        }
        inputClasses.delete(name);
        loadErrors.delete(name);
        try {
          const cf = load(data, name);
          inputClasses.set(name, cf);
        } catch (error) {
          loadErrors.set(name, {
            code: error instanceof DecompileLimitError ? error.code : 'CLASS_PARSE_FAILED',
            severity: 'error',
            stage: 'parse',
            inputName: name,
            message: errorMessage(error),
          });
        }
      }
    },
    decompileAll: () => decompileAllDetailed().sources,
    decompileAllDetailed,
    getDiagnostics: () => {
      const diagnostics = new DiagnosticBag();
      for (const diagnostic of loadErrors.values()) diagnostics.add(diagnostic);
      for (const diagnostic of loadWarnings.values()) diagnostics.add(diagnostic);
      for (const diagnostic of lastDiagnostics) diagnostics.add(diagnostic);
      return diagnostics.snapshot();
    },
  };
}

export function decompileClassFile(data: Uint8Array, options?: DecompileOptions): ClassSource {
  const budget = new WorkBudget(options ?? {});
  budget.input(data.byteLength);
  budget.inputs(data.byteLength, 1);
  const cf = parseClass(data);
  if (shouldSkip(cf)) {
    return {
      name: cf.name,
      path: cf.name + '.skip',
      source: '/* Module descriptors are not emitted as Java classes. */\n',
      status: 'partial',
      diagnostics: [
        {
          code: 'CLASS_SKIPPED',
          severity: 'warning',
          stage: 'render',
          className: cf.name,
          message: 'Module descriptors are not emitted as Java classes',
        },
      ],
    };
  }
  const ctx = new Ctx(cf, new Map([[cf.name, cf]]), options ?? {}, undefined, budget);
  return generateClass(ctx, cf, true);
}

export function decompileClassSetDetailed(
  datas: Map<string, Uint8Array>,
  options?: DecompileOptions,
): DecompileReport {
  const decompiler = createDecompiler(options);
  decompiler.addClasses(datas);
  return decompiler.decompileAllDetailed();
}

export function decompileClassSet(
  datas: Map<string, Uint8Array>,
  options?: DecompileOptions,
): ClassSource[] {
  return decompileClassSetDetailed(datas, options).sources;
}

function shouldSkip(cls: ClassFile): boolean {
  return (cls.access & 0x8000) !== 0;
}

export { parseClass };
export * as internal from './internal.js';
