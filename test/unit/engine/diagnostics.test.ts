import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDecompiler,
  decompileClassFile,
  decompileClassSetDetailed,
  parseClass,
} from '../../../src/index.js';
import { Ctx } from '../../../src/decompile/context.js';
import { decompileMethod } from '../../../src/decompile/method.js';
import { classBytes, moduleBytes } from '../../support/class-builder.js';

const valid = () => classBytes('Healthy', [{ name: 'value', code: [0x04, 0xac] }]);

test('successful sources have explicit success status and no diagnostics', () => {
  const result = decompileClassFile(valid(), { banner: false });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.source, /return 1;/);
});

test('a failed method reports stage, class, method and descriptor once across rendering passes', () => {
  const data = classBytes('Mixed', [
    { name: 'broken', code: [0xcb] },
    { name: 'value', code: [0x04, 0xac] },
  ]);
  const result = decompileClassFile(data);
  assert.equal(result.status, 'partial');
  assert.equal(result.diagnostics.length, 1);
  assert.deepEqual(
    { ...result.diagnostics[0], message: '' },
    {
      code: 'METHOD_DECOMPILE_FAILED',
      severity: 'error',
      stage: 'decode',
      className: 'Mixed',
      methodName: 'broken',
      descriptor: '()I',
      message: '',
    },
  );
  assert.match(result.source, /return 1;/);
});

test('batch parsing reports partial and failed results without losing healthy classes', () => {
  const partial = decompileClassSetDetailed(
    new Map([
      ['bad.class', new Uint8Array()],
      ['ok.class', valid()],
    ]),
  );
  assert.equal(partial.status, 'partial');
  assert.equal(partial.sources.length, 1);
  assert.equal(partial.sources[0].status, 'success');
  assert.equal(partial.diagnostics[0].inputName, 'bad.class');
  assert.equal(partial.diagnostics[0].code, 'CLASS_PARSE_FAILED');
  const failed = decompileClassSetDetailed(new Map([['bad.class', new Uint8Array()]]));
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.sources, []);
  assert.throws(() => decompileClassFile(new Uint8Array()));
});

test('nested method failures propagate to their enclosing source and repeated calls are stable', () => {
  const d = createDecompiler();
  d.addClasses(
    new Map([
      ['Outer.class', classBytes('Outer', [])],
      ['Outer$Inner.class', classBytes('Outer$Inner', [{ name: 'broken', code: [0xcb] }], 'Outer')],
    ]),
  );
  const first = d.decompileAllDetailed();
  assert.equal(first.status, 'partial');
  assert.equal(first.sources[0].status, 'partial');
  assert.equal(first.diagnostics.length, 1);
  assert.equal(first.diagnostics[0].className, 'Outer$Inner');
  assert.deepEqual(d.decompileAllDetailed(), first);
  first.diagnostics[0].message = 'changed by caller';
  assert.notEqual(d.getDiagnostics()[0].message, 'changed by caller');
});

test('replacing a failed batch input clears its old parse diagnostic', () => {
  const d = createDecompiler();
  d.addClasses(new Map([['input.class', new Uint8Array()]]));
  assert.equal(d.getDiagnostics().length, 1);
  d.decompileAllDetailed();
  d.addClasses(new Map([['input.class', valid()]]));
  assert.deepEqual(d.getDiagnostics(), []);
  assert.equal(d.decompileAllDetailed().status, 'success');
});

test('class rendering exceptions are isolated from other top-level classes', () => {
  const d = createDecompiler();
  const invalid = d.addClass(classBytes('Invalid', []));

  invalid.fields.push({
    name: 'x',
    descriptor: '?',
    access: 0x0019,
    annotations: [],
    synthetic: false,
    deprecated: false,
    constantValue: { tag: 'int', value: 1 },
  });
  d.addClass(valid());
  const result = d.decompileAllDetailed();
  assert.equal(result.status, 'partial');
  assert.deepEqual(
    result.sources.map((s) => s.name),
    ['Healthy'],
  );
  assert.equal(result.diagnostics[0].code, 'CLASS_RENDER_FAILED');
});

test('method AST cache is isolated from rendering mutations', () => {
  const cf = parseClass(valid());
  const ctx = new Ctx(cf, new Map([[cf.name, cf]]));
  const first = decompileMethod(ctx, cf, cf.methods[0])!;
  first.stmts.length = 0;
  const second = decompileMethod(ctx, cf, cf.methods[0])!;
  assert.equal(second.stmts.length, 1);
  assert.equal(second.stmts[0].kind, 'return');
});

test('a bad replacement never returns the previously loaded source', () => {
  const d = createDecompiler();
  d.addClasses(new Map([['input.class', valid()]]));
  assert.equal(d.decompileAllDetailed().sources.length, 1);
  d.addClasses(new Map([['input.class', new Uint8Array()]]));
  const result = d.decompileAllDetailed();
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.sources, []);
});

test('bytecode simulation errors are distinguished from decoding errors', () => {
  const result = decompileClassFile(
    classBytes('Underflow', [{ name: 'broken', code: [0x57, 0xac] }]),
  );
  assert.equal(result.status, 'partial');
  assert.equal(result.diagnostics[0].stage, 'simulate');
  assert.match(result.diagnostics[0].message, /stack underflow/);
});

test('unsupported invokedynamic is reported with its bytecode offset', () => {
  const d = createDecompiler();
  const cf = d.addClass(classBytes('Dynamic', [{ name: 'value', code: [0xba, 0, 1, 0, 0, 0xac] }]));
  cf.cp.dynamic = () => ({ bsm: 0, name: 'value', descriptor: '()I' });
  cf.bootstrapMethods = [
    {
      ref: { kind: 6, ref: { owner: 'custom/Bootstrap', name: 'bootstrap', descriptor: '()V' } },
      args: [],
    },
  ];
  const report = d.decompileAllDetailed();
  assert.equal(report.status, 'partial');
  assert.equal(report.sources[0].status, 'partial');
  const diagnostic = report.diagnostics.find((d) => d.code === 'UNSUPPORTED_INVOKEDYNAMIC');
  assert.equal(diagnostic?.bytecodeOffset, 0);
  assert.match(report.sources[0].source, /decompilation failed/);
});

test('cyclic inner-class metadata cannot silently disappear beside a healthy class', () => {
  const result = decompileClassSetDetailed(
    new Map([
      ['a', classBytes('CycleA', [], 'CycleB')],
      ['b', classBytes('CycleB', [], 'CycleA')],
      ['healthy', valid()],
    ]),
  );
  assert.equal(result.status, 'partial');
  assert.equal(result.sources.length, 1);
  assert.equal(result.diagnostics.length, 2);
  assert.ok(result.diagnostics.every((d) => d.code === 'CLASS_RENDER_FAILED'));
});

test('module descriptors are explicitly skipped rather than reported as successful Java source', () => {
  const source = decompileClassFile(moduleBytes());
  assert.equal(source.status, 'partial');
  assert.ok(source.path.endsWith('.skip'));
  const batch = decompileClassSetDetailed(new Map([['module-info.class', moduleBytes()]]));
  assert.equal(batch.status, 'success');
  assert.deepEqual(batch.sources, []);
  assert.equal(batch.diagnostics[0].code, 'CLASS_SKIPPED');
  assert.equal(batch.diagnostics[0].severity, 'info');
});

test('malformed member descriptors fail during parsing and are isolated in batch reports', () => {
  for (const descriptor of ['a', '(I)', '()Iextra']) {
    const bad = classBytes('BadDescriptor', [{ name: 'value', descriptor, code: [4, 0xac] }]);
    assert.throws(() => parseClass(bad));
    const report = decompileClassSetDetailed(
      new Map([
        ['bad.class', bad],
        ['healthy.class', valid()],
      ]),
    );
    assert.equal(report.sources.length, 1);
    assert.equal(report.sources[0].status, 'success');
    assert.equal(
      report.diagnostics.some((d) => d.stage === 'parse'),
      true,
    );
  }
});

test('duplicate class names report the replaced and selected batch inputs', () => {
  const first = classBytes('Duplicate', [{ name: 'value', code: [4, 172] }]);
  const second = classBytes('Duplicate', [{ name: 'value', code: [5, 172] }]);
  const d = createDecompiler({
    maxClasses: 1,
    maxTotalInputBytes: Math.max(first.length, second.length),
  });
  d.addClasses(
    new Map([
      ['base.class', first],
      ['version.class', second],
    ]),
  );
  const result = d.decompileAllDetailed();
  assert.equal(result.status, 'partial');
  assert.equal(result.sources.length, 1);
  assert.match(result.sources[0].source, /return 2;/);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, 'DUPLICATE_CLASS');
  assert.equal(result.diagnostics[0].className, 'Duplicate');
  assert.equal(result.diagnostics[0].inputName, 'version.class');
  assert.match(result.diagnostics[0].message, /base.class/);
  assert.deepEqual(d.getDiagnostics(), result.diagnostics);
  assert.deepEqual(d.decompileAllDetailed(), result);
  d.addClasses(new Map([['version.class', first]]));
  assert.equal(d.decompileAllDetailed().status, 'success');
  assert.deepEqual(d.getDiagnostics(), []);
});

test('direct duplicate additions also report replacement without discarding the selected class', () => {
  const d = createDecompiler();
  d.addClass(valid());
  d.addClass(valid());
  assert.equal(d.getDiagnostics()[0].code, 'DUPLICATE_CLASS');
  assert.equal(d.decompileAllDetailed().status, 'partial');
  assert.equal(d.decompileAllDetailed().sources.length, 1);
});

test('dollar names without nesting metadata remain distinct top-level classes', () => {
  const names = ['Example', 'Example$1', 'Example$Part', 'Example$1Local', 'Example_Part'];
  const inputs = new Map(names.map((name) => [name + '.class', classBytes(name, [])]));
  for (const [name, bytes] of inputs) {
    const source = decompileClassFile(bytes);
    assert.equal(source.path, name.replace(/\.class$/, '.java'));
    assert.ok(source.source.includes(`public class ${name.slice(0, -6)} {`));
    assert.equal(source.status, 'success');
  }
  const report = decompileClassSetDetailed(inputs);
  assert.equal(report.status, 'success');
  assert.deepEqual(
    report.sources.map((source) => source.name),
    names,
  );
  assert.equal(new Set(report.sources.map((source) => source.path)).size, names.length);
});

for (const [label, code, stage] of [
  ['unknown opcode', [0x2a, 0xdc, 0xac], 'decode'],
  ['truncated instruction', [0x2a, 0xb4], 'decode'],
  ['invalid field reference', [0x2a, 0xb4, 0xff, 0xff, 0xac], 'simulate'],
] as const) {
  test(`damaged inner accessor with ${label} retains its method diagnostic and healthy source`, () => {
    const bytes = classBytes(
      'Outer$Inner',
      [
        { name: 'access$000', descriptor: '(LOuter$Inner;)I', access: 0x1008, code: [...code] },
        { name: 'value', code: [0x04, 0xac] },
      ],
      'Outer',
      0x0001,
    );
    const single = decompileClassFile(bytes);
    assert.equal(single.status, 'partial');
    assert.match(single.source, /access\$000/);
    assert.match(single.source, /return 1;/);
    assert.equal(single.diagnostics.length, 1);
    assert.equal(single.diagnostics[0].code, 'METHOD_DECOMPILE_FAILED');
    assert.equal(single.diagnostics[0].stage, stage);
    assert.equal(single.diagnostics[0].methodName, 'access$000');
    const d = createDecompiler();
    d.addClasses(
      new Map([
        ['Outer.class', classBytes('Outer', [])],
        ['Outer$Inner.class', bytes],
        ['Healthy.class', valid()],
      ]),
    );
    const batch = d.decompileAllDetailed();
    assert.equal(batch.status, 'partial');
    assert.equal(batch.sources.length, 2);
    assert.equal(batch.sources.find((source) => source.name === 'Healthy')?.status, 'success');
    assert.equal(batch.sources.find((source) => source.name === 'Outer')?.status, 'partial');
    assert.deepEqual(batch.diagnostics, single.diagnostics);
    assert.deepEqual(d.decompileAllDetailed(), batch);
  });
}
