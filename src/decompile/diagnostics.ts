export type DecompileStatus = 'success' | 'partial' | 'failed';
export type DiagnosticStage =
  'parse' | 'decode' | 'cfg' | 'simulate' | 'structure' | 'transform' | 'render' | 'decompile';
export type DiagnosticCode =
  | 'CLASS_PARSE_FAILED'
  | 'CLASS_RENDER_FAILED'
  | 'CLASS_SKIPPED'
  | 'MISSING_ENCLOSING_CLASS'
  | 'METHOD_DECOMPILE_FAILED'
  | 'ANONYMOUS_METHOD_RENDER_FAILED'
  | 'LAMBDA_DECOMPILE_FAILED'
  | 'UNSUPPORTED_INVOKEDYNAMIC'
  | 'UNSUPPORTED_CONSTANT'
  | 'INVALID_BOOTSTRAP';

export interface DecompileDiagnostic {
  code: DiagnosticCode;
  severity: 'info' | 'warning' | 'error';
  stage: DiagnosticStage;
  message: string;
  inputName?: string;
  className?: string;
  methodName?: string;
  descriptor?: string;
  bytecodeOffset?: number;
}

export class DiagnosticBag {
  private readonly entries = new Map<string, DecompileDiagnostic>();

  add(diagnostic: DecompileDiagnostic): void {
    const key = JSON.stringify([
      diagnostic.code,
      diagnostic.stage,
      diagnostic.severity,
      diagnostic.inputName,
      diagnostic.className,
      diagnostic.methodName,
      diagnostic.descriptor,
      diagnostic.bytecodeOffset,
      diagnostic.message,
    ]);
    this.entries.set(key, { ...diagnostic });
  }

  snapshot(): DecompileDiagnostic[] {
    return [...this.entries.values()].map((d) => ({ ...d }));
  }
}

export function diagnosticStatus(
  diagnostics: readonly DecompileDiagnostic[],
  hasSource = true,
): DecompileStatus {
  return diagnostics.some((d) => d.severity !== 'info')
    ? hasSource
      ? 'partial'
      : 'failed'
    : 'success';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
