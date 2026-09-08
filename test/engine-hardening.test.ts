import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDecompiler,
  decompileClassFile,
  decompileClassSetDetailed,
  DecompileLimitError,
} from '../src/index.js';
import { parseStackMap } from '../src/classfile/stackmap.js';
import { DynamicClassBuilder } from './dynamic-class-builder.js';

const bytes = () => new DynamicClassBuilder().build([0x04, 0xac], '()I');

for (const options of [
  { maxInputBytes: 1 },
  { maxWork: 0 },
  { maxOutputChars: 1 },
  { timeoutMs: 0 },
  { signal: { aborted: true } },
]) {
  test(`resource limits stop single and batch decompilation: ${JSON.stringify(options)}`, () => {
    assert.throws(() => decompileClassFile(bytes(), options), DecompileLimitError);
    const result = decompileClassSetDetailed(new Map([['input', bytes()]]), options);
    assert.equal(result.status, 'failed');
    assert.equal(result.sources.length, 0);
    assert.ok(
      result.diagnostics.some(
        (d) => d.code === ('signal' in options ? 'DECOMPILE_CANCELLED' : 'RESOURCE_LIMIT'),
      ),
    );
  });
}

test('budgets reset between operations and reject invalid options', () => {
  const d = createDecompiler({ maxWork: 1000, maxOutputChars: 2000 });
  d.addClass(bytes());
  assert.equal(d.decompileAllDetailed().status, 'success');
  assert.equal(d.decompileAllDetailed().status, 'success');
  for (const value of [-1, NaN, Infinity])
    assert.throws(() => createDecompiler({ maxWork: value }), RangeError);
});

test('cancellation after loading is observed before rendering', () => {
  const signal = { aborted: false };
  const d = createDecompiler({ signal });
  d.addClass(bytes());
  signal.aborted = true;
  assert.equal(d.decompileAllDetailed().diagnostics[0].code, 'DECOMPILE_CANCELLED');
});

test('StackMapTable parsing rejects reserved tags, invalid types, truncation and trailing data', () => {
  const d = createDecompiler();
  const cp = d.addClass(bytes()).cp;
  for (const data of [
    [0, 1, 128],
    [0, 1, 64, 9],
    [0, 1, 247],
    [0, 0, 0],
  ])
    assert.throws(() => parseStackMap(Uint8Array.from(data), cp));
  const frames = parseStackMap(Uint8Array.from([0, 2, 0, 64, 1]), cp);
  assert.deepEqual(
    frames.map((f) => [f.offset, f.stack.length]),
    [
      [0, 0],
      [1, 1],
    ],
  );
});

for (const variant of ['offset', 'stack', 'locals', 'uninitialized']) {
  test(`StackMapTable ${variant} inconsistencies cannot return success`, () => {
    const d = createDecompiler();
    const cls = d.addClass(bytes());
    cls.methods[0].code!.stackMapFrames = [
      {
        offset: variant === 'offset' ? 9 : 0,
        chop: variant === 'locals' ? 1 : 0,
        full: false,
        locals: [],
        stack:
          variant === 'stack'
            ? [{ tag: 4 }]
            : variant === 'uninitialized'
              ? [{ tag: 8, offset: 0 }]
              : [],
      },
    ];
    const result = d.decompileAllDetailed();
    assert.equal(result.status, 'partial');
    assert.ok(result.diagnostics.some((d) => /StackMapTable/.test(d.message)));
  });
}

test('output limits are shared across a batch without discarding earlier sources', () => {
  const first = new DynamicClassBuilder('First').build([0x04, 0xac], '()I');
  const second = new DynamicClassBuilder('Second').build([0x04, 0xac], '()I');
  const size = decompileClassFile(first).source.length;
  const result = decompileClassSetDetailed(
    new Map([
      ['first', first],
      ['second', second],
    ]),
    { maxOutputChars: size },
  );
  assert.equal(result.status, 'partial');
  assert.deepEqual(
    result.sources.map((s) => s.name),
    ['First'],
  );
  assert.ok(
    result.diagnostics.some((d) => d.code === 'RESOURCE_LIMIT' && d.className === 'Second'),
  );
});
