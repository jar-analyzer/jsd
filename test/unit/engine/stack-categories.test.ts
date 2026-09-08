import test from 'node:test';
import assert from 'node:assert/strict';
import { ConstantPool } from '../../../src/classfile/cpool.js';
import { ByteReader } from '../../../src/util/bytes.js';
import { ExprStack } from '../../../src/decompile/simulate/stack.js';

const forms: { op: 'dupX2' | 'dup2X2'; widths: boolean[]; order: number[] }[] = [
  { op: 'dupX2', widths: [false, false, false], order: [2, 0, 1, 2] },
  { op: 'dupX2', widths: [true, false], order: [1, 0, 1] },
  { op: 'dup2X2', widths: [false, false, false, false], order: [2, 3, 0, 1, 2, 3] },
  { op: 'dup2X2', widths: [false, false, true], order: [2, 0, 1, 2] },
  { op: 'dup2X2', widths: [true, false, false], order: [1, 2, 0, 1, 2] },
  { op: 'dup2X2', widths: [true, true], order: [1, 0, 1] },
];
for (const { op, widths, order } of forms) {
  test(`${op} preserves category widths and value order for ${widths.map((w) => (w ? 2 : 1)).join(',')}`, () => {
    const stack = new ExprStack();
    const values = widths.map((wide, slot) => ({ kind: 'local' as const, slot, name: `v${slot}` }));
    values.forEach((value, i) => stack.push(value, widths[i]));
    stack[op]();
    assert.deepEqual(
      stack.items.map((item) => item.e),
      order.map((i) => values[i]),
    );
    assert.deepEqual(
      stack.items.map((item) => item.w),
      order.map((i) => widths[i]),
    );
  });
}

test('CONSTANT_Long decodes signed two-complement boundaries exactly', () => {
  for (const expected of [-9223372036854775808n, -4294967296n, -1n, 0n, 1n, 9223372036854775807n]) {
    const bytes = new Uint8Array(11);
    bytes.set([0, 3, 5]);
    new DataView(bytes.buffer).setBigInt64(3, expected, false);
    const cp = new ConstantPool(new ByteReader(bytes));
    assert.deepEqual(cp.constVal(1), { type: 'long', value: expected });
  }
});
