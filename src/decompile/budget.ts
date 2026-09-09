import type { DecompileOptions } from './context.js';

export class DecompileLimitError extends Error {
  readonly code: 'RESOURCE_LIMIT' | 'DECOMPILE_CANCELLED';
  constructor(message: string, cancelled = false) {
    super(message);
    this.name = 'DecompileLimitError';
    this.code = cancelled ? 'DECOMPILE_CANCELLED' : 'RESOURCE_LIMIT';
  }
}

export class WorkBudget {
  private work = 0;
  private output = 0;
  private readonly started = performance.now();
  constructor(private readonly options: DecompileOptions) {
    for (const key of [
      'maxInputBytes',
      'maxTotalInputBytes',
      'maxClasses',
      'maxWork',
      'maxOutputChars',
      'timeoutMs',
    ] as const) {
      const value = options[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0))
        throw new RangeError(`${key} must be a finite nonnegative number`);
    }
  }
  check(cost = 0): void {
    if (this.options.signal?.aborted)
      throw new DecompileLimitError('Decompilation cancelled', true);
    this.work += cost;
    if (this.options.maxWork !== undefined && this.work > this.options.maxWork)
      throw new DecompileLimitError('Decompilation work budget exceeded');
    if (
      this.options.timeoutMs !== undefined &&
      performance.now() - this.started >= this.options.timeoutMs
    )
      throw new DecompileLimitError('Decompilation time budget exceeded');
  }
  input(bytes: number): void {
    this.check();
    if (this.options.maxInputBytes !== undefined && bytes > this.options.maxInputBytes)
      throw new DecompileLimitError('Class input size limit exceeded');
  }
  inputs(bytes: number, classes: number): void {
    this.check();
    if (this.options.maxTotalInputBytes !== undefined && bytes > this.options.maxTotalInputBytes)
      throw new DecompileLimitError('Total class input size limit exceeded');
    if (this.options.maxClasses !== undefined && classes > this.options.maxClasses)
      throw new DecompileLimitError('Class count limit exceeded');
  }
  previewOutput(chars: number): void {
    this.check();
    if (
      this.options.maxOutputChars !== undefined &&
      this.output + chars > this.options.maxOutputChars
    )
      throw new DecompileLimitError('Generated source size limit exceeded');
  }
  previewSource(source: string): void {
    this.previewOutput(source.replace(/\s/g, '').length);
  }
  outputChars(chars: number): void {
    this.previewOutput(chars);
    this.output += chars;
  }
}

export class OutputLines extends Array<string> {
  private chars = 0;
  constructor(private readonly budget: WorkBudget) {
    super();
  }
  static get [Symbol.species](): ArrayConstructor {
    return Array;
  }
  override push(...lines: string[]): number {
    const chars = lines.reduce((sum, line) => sum + line.replace(/\s/g, '').length, this.chars);
    this.budget.previewOutput(chars);
    this.chars = chars;
    return super.push(...lines);
  }
}
