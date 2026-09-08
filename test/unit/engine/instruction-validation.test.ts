import test from 'node:test';
import assert from 'node:assert/strict';
import { decompileClassFile, parseClass } from '../../../src/index.js';
import {
  parseFieldDescriptor,
  parseMethodDescriptor,
  parseClassSignature,
  parseSignature,
} from '../../../src/classfile/types.js';
import { decodeBytecode } from '../../../src/bytecode/decode.js';
import { ExprStack } from '../../../src/decompile/simulate/stack.js';
import { DynamicClassBuilder } from '../../support/dynamic-class-builder.js';

for (const [name, code, descriptor, message] of [
  ['wide', [0xc4, 0, 0, 0, 0xb1], '()V', /wide/],
  ['dup', [0x09, 0x59, 0x58, 0x58, 0xb1], '()V', /category/],
  ['return opcode', [0x04, 0xb0], '()I', /return opcode/],
  ['return underflow', [0xac], '()I', /underflow/],
  ['return category', [0x09, 0xac], '()I', /return operand/],
  ['void return', [0xb1], '()I', /return opcode/],
  ['branch middle', [0x10, 0x07, 0xa7, 0xff, 0xff], '()V', /branch target/],
  ['branch outside', [0xa7, 0, 10], '()V', /branch target/],
] as const) {
  test(`invalid ${name} cannot report success`, () => {
    const bytes = new DynamicClassBuilder().build([...code], descriptor);
    bytes[7] = 49;
    const report = decompileClassFile(bytes);
    assert.equal(report.status, 'partial');
    assert.ok(
      report.diagnostics.some((d) => message.test(d.message)),
      JSON.stringify(report.diagnostics),
    );
  });
}

const operations = {
  dup: [[false]],
  dupX1: [[false, false]],
  dupX2: [
    [false, true],
    [false, false, false],
  ],
  dup2: [[true], [false, false]],
  dup2X1: [
    [true, false],
    [false, false, false],
  ],
  dup2X2: [
    [true, true],
    [true, false, false],
    [false, false, true],
    [false, false, false, false],
  ],
  swap: [[false, false]],
};
for (const [name, forms] of Object.entries(operations)) {
  test(`${name} accepts only legal stack category forms`, () => {
    for (let depth = 0; depth <= 4; depth++) {
      for (let mask = 0; mask < 1 << depth; mask++) {
        const top = Array.from({ length: depth }, (_, i) => !!(mask & (1 << i)));
        const stack = new ExprStack();
        [...top]
          .reverse()
          .forEach((wide, slot) => stack.push({ kind: 'local', slot, name: `v${slot}` }, wide));
        const valid = forms.some((form) => form.every((wide, i) => top[i] === wide));
        const run = () => stack[name as keyof typeof operations]();
        if (valid) assert.doesNotThrow(run);
        else assert.throws(run, /category/);
      }
    }
  });
}

test('wide load and iinc preserve unsigned slots and signed increments', () => {
  const ins = decodeBytecode(Uint8Array.from([0xc4, 0x15, 1, 0, 0xc4, 0x84, 1, 0, 0xff, 0xfe]));
  assert.equal(ins[0].local, 256);
  assert.equal(ins[1].local, 256);
  assert.equal(ins[1].iincVal, -2);
});

test('descriptor parsing rejects signature syntax and invalid field types', () => {
  for (const descriptor of [
    'V',
    '[V',
    'Ljava/lang/String',
    'L;',
    'TT;',
    'Ljava/util/List<Ljava/lang/String;>;',
    '['.repeat(256) + 'I',
  ])
    assert.throws(() => parseFieldDescriptor(descriptor), descriptor);
  for (const descriptor of ['(V)V', '(TT;)V', '()[V']) {
    assert.throws(() => parseMethodDescriptor(descriptor), descriptor);
    assert.throws(
      () => parseClass(new DynamicClassBuilder().build([0xb1], descriptor)),
      descriptor,
    );
  }
  assert.equal(parseMethodDescriptor('(BCDFIJSZ[Ljava/lang/String;)V').params.length, 9);
  assert.equal(parseFieldDescriptor('['.repeat(255) + 'I').kind, 'array');
});

test('generic signatures retain every interface bound and parameterized parent', () => {
  const method = parseSignature(
    '<T::Ljava/lang/Runnable;:Ljava/io/Serializable;:Ljava/lang/Cloneable;>(TT;)V',
  );
  assert.ok('typeParams' in method);
  assert.equal(method.typeParams.length, 1);
  assert.equal(method.typeParams[0].ifaceBounds.length, 3);
  const cls = parseClassSignature(
    '<T:Ljava/lang/Object;>Ljava/util/ArrayList<TT;>;Ljava/lang/Comparable<LExample<TT;>;>;',
  );
  assert.deepEqual(cls.superType, {
    kind: 'class',
    name: 'java/util/ArrayList',
    args: [{ kind: 'typevar', name: 'T' }],
  });
  assert.equal(cls.interfaces.length, 1);
});
