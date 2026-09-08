import test from 'node:test';
import assert from 'node:assert/strict';
import { validationFixtures } from './validation-fixtures.js';
import { decompileClassSetDetailed, createDecompiler, DecompileLimitError } from '../src/index.js';
import { DynamicClassBuilder } from './dynamic-class-builder.js';
import { buildCFG } from '../src/bytecode/cfg.js';
import { decodeBytecode } from '../src/bytecode/decode.js';
import { WorkBudget, OutputLines } from '../src/decompile/budget.js';

for (const fixture of validationFixtures())
  test(`${fixture.name} cannot report success`, () => {
    const result = decompileClassSetDetailed(new Map([[fixture.name, fixture.bytes]]));
    assert.notEqual(result.status, 'success');
    assert.ok(result.diagnostics.some((d) => d.severity === 'error'));
  });

test('batch input limits reject additions before method parsing and retain accepted classes', () => {
  const a = new DynamicClassBuilder('BudgetA').build([4, 172], '()I');
  const b = new DynamicClassBuilder('BudgetB').build([4, 172], '()I');
  for (const options of [{ maxTotalInputBytes: a.length + b.length - 1 }, { maxClasses: 1 }]) {
    const d = createDecompiler(options);
    d.addClass(a);
    d.addClass(a);
    assert.throws(() => d.addClass(b), DecompileLimitError);
    assert.throws(
      () =>
        d.addClass(Uint8Array.from(b, (value, index) => (index >= b.length - 10 ? 255 : value))),
      DecompileLimitError,
    );
    assert.deepEqual(
      d.decompileAllDetailed().sources.map((s) => s.name),
      ['BudgetA'],
    );
  }
  const d = createDecompiler({ maxClasses: 1, maxTotalInputBytes: a.length });
  d.addClasses(new Map([['a', a]]));
  d.addClasses(new Map([['a', a]]));
  assert.equal(d.decompileAllDetailed().status, 'success');
});

test('output construction stops before retaining an oversized chunk', () => {
  const budget = new WorkBudget({ maxOutputChars: 20 });
  const lines = new OutputLines(budget);
  lines.push('first');
  assert.throws(() => lines.push('x'.repeat(20)), DecompileLimitError);
  assert.deepEqual(Array.from(lines), ['first']);
  lines.push('last');
  assert.deepEqual(Array.from(lines), ['first', 'last']);
});

test('CFG handles a long chain iteratively and observes work limits inside construction', () => {
  const bytes: number[] = [];
  for (let i = 0; i < 10000; i++) bytes.push(167, 0, 3);
  bytes.push(177);
  const instructions = decodeBytecode(Uint8Array.from(bytes));
  const cfg = buildCFG(instructions, new Set());
  assert.equal(cfg.blocks.length, 10001);
  assert.equal(cfg.idom[10000], 9999);
  assert.throws(
    () =>
      buildCFG(
        instructions,
        new Set(),
        new Set(),
        new WorkBudget({ maxWork: instructions.length + 10 }),
      ),
    DecompileLimitError,
  );
});

test('unknown external inheritance is not treated as a proven frame mismatch', () => {
  const b = new DynamicClassBuilder('ExternalFrame');
  const base = b.classRef('external/Base');
  const bytes = b.build([42, 176], '(Lexternal/Derived;)Ljava/lang/Object;', {
    stackMap: [0, 1, 255, 0, 0, 0, 1, 7, base >>> 8, base & 255, 0, 0],
  });
  const result = decompileClassSetDetailed(new Map([['external', bytes]]));
  assert.equal(result.status, 'success');
});

test('source limits interrupt member rendering before later method bodies are read', () => {
  const d = createDecompiler({ maxOutputChars: 200, banner: false });
  const cf = d.addClass(new DynamicClassBuilder('EarlyOutputLimit').build([4, 172], '()I'));
  let bodyReads = 0;
  const code = cf.methods[0].code!.code;
  Object.defineProperty(cf.methods[0].code, 'code', {
    get: () => {
      bodyReads++;
      return code;
    },
  });
  cf.fields = Array.from({ length: 100 }, (_, i) => ({
    name: `field${i}`,
    descriptor: 'I',
    access: 9,
    annotations: [],
    synthetic: false,
    deprecated: false,
  }));
  const result = d.decompileAllDetailed();
  assert.equal(result.status, 'failed');
  assert.ok(result.diagnostics.some((d) => d.code === 'RESOURCE_LIMIT'));
  assert.equal(bodyReads, 0);
});

test('batch input accounting releases replaced aliases', () => {
  const bytes = new DynamicClassBuilder('AliasedBudget').build([4, 172], '()I');
  const d = createDecompiler({ maxClasses: 1, maxTotalInputBytes: bytes.length });
  d.addClasses(new Map([['first', bytes]]));
  d.addClasses(new Map([['second', bytes]]));
  d.addClasses(new Map([['first', new Uint8Array()]]));
  const result = d.decompileAllDetailed();
  assert.deepEqual(
    result.sources.map((source) => source.name),
    ['AliasedBudget'],
  );
  assert.equal(result.status, 'partial');
});

test('frame verification handles many straight-line local stores within a legal method', async () => {
  const { verifyFrames } = await import('../src/decompile/verify.js');
  const { Ctx } = await import('../src/decompile/context.js');
  const { parseClass } = await import('../src/classfile/parser.js');
  const code: number[] = [];
  for (let slot = 0; slot < 10000; slot++) code.push(3, 196, 54, slot >>> 8, slot & 255);
  code.push(177);
  const cf = parseClass(
    new DynamicClassBuilder('ManyFrameLocals').build(code, '()V', {
      maxLocals: 10000,
      stackMap: [0, 1, 0],
    }),
  );
  const instructions = decodeBytecode(cf.methods[0].code!.code);
  const ctx = new Ctx(cf, new Map([[cf.name, cf]]), { maxWork: 100000 });
  assert.doesNotThrow(() => verifyFrames(ctx, cf, cf.methods[0], instructions));
});
