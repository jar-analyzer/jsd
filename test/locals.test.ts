import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClass } from '../src/classfile/parser.js';
import { decodeBytecode } from '../src/bytecode/decode.js';
import { buildCFG } from '../src/bytecode/cfg.js';
import { splitLocalSlots } from '../src/decompile/locals.js';
import { classBytes } from './class-builder.js';

function split(code: number[], descriptor = '()I') {
  const cf = parseClass(classBytes('Slots', [{ name: 'value', descriptor, code }]));
  const instructions = decodeBytecode(cf.methods[0].code!.code);
  const cfg = buildCFG(instructions, new Set());
  splitLocalSlots(cfg, cf.methods[0]);
  return instructions;
}

test('independent integer and reference lifetimes sharing a JVM slot become different variables', () => {
  const ins = split([0x04, 0x3b, 0x1a, 0x57, 0x01, 0x4b, 0x2a, 0x57, 0x05, 0xac]);
  assert.equal(ins[1].local, ins[2].local);
  assert.equal(ins[5].local, ins[6].local);
  assert.notEqual(ins[1].local, ins[5].local);
});

test('definitions read at a branch join remain the same source variable', () => {
  const ins = split([0x1a, 0x99, 0, 8, 0x04, 0x3c, 0xa7, 0, 5, 0x05, 0x3c, 0x1b, 0xac], '(Z)I');
  const stores = ins.filter((i) => i.name === 'istore_1');
  const load = ins.find((i) => i.name === 'iload_1')!;
  assert.equal(stores.length, 2);
  assert.equal(stores[0].local, stores[1].local);
  assert.equal(stores[0].local, load.local);
  assert.equal(ins[0].local, 0);
});

test('hidden compiler temporaries are separated from reused debug-variable slots', () => {
  const cls = parseClass(
    classBytes('DebugSlots', [
      { name: 'value', code: [0x0c, 0x43, 0x22, 0x57, 4, 0x3b, 0x1a, 0xac] },
    ]),
  );
  const method = cls.methods[0];
  method.code!.localVars = [{ index: 0, name: 'value', descriptor: 'F', start: 2, length: 2 }];
  const before = structuredClone(method);
  const instructions = decodeBytecode(method.code!.code);
  const cfg = buildCFG(instructions, new Set());
  splitLocalSlots(cfg, method);
  assert.equal(instructions[1].local, 0);
  assert.equal(instructions[2].local, 0);
  assert.equal(instructions[5].local, instructions[6].local);
  assert.notEqual(instructions[5].local, 0);
  assert.deepEqual(method, before);
});
