import { ByteReader } from '../util/bytes.js';
import { OPCODES } from '../classfile/opcodes.js';

export interface Instr {
  pc: number;
  op: number;
  name: string;
  cpIndex?: number;
  imm?: number;
  local?: number;
  originalLocal?: number;
  iincVal?: number;
  branch?: number;
  atype?: number;
  dims?: number;
  count?: number;
  bsmIndex?: number;
  indyName?: string;
  indyDesc?: string;
  switchDefault?: number;
  switchCases?: { value: number; target: number }[];
  size: number;
}

export class DecodeError extends Error {}

export function decodeBytecode(code: Uint8Array): Instr[] {
  const r = new ByteReader(code);
  const out: Instr[] = [];
  while (r.remaining > 0) {
    const pc = r.offset;
    const op = r.u1();
    const info = OPCODES[op];
    if (!info) throw new DecodeError(`unknown opcode 0x${op.toString(16)} at pc ${pc}`);
    const ins: Instr = { pc, op, name: info.name, size: 0 };
    let end = pc;
    switch (info.fmt) {
      case 'none':
        end = pc + 1;
        break;
      case 'reserved':
        throw new DecodeError(`reserved opcode at pc ${pc}`);
      case 's1':
        ins.imm = (r.u1() << 24) >> 24;
        end = pc + 2;
        break;
      case 's2':
        ins.imm = (r.u2() << 16) >> 16;
        end = pc + 3;
        break;
      case 'u1c':
        ins.cpIndex = r.u1();
        end = pc + 2;
        break;
      case 'u2c':
        ins.cpIndex = r.u2();
        end = pc + 3;
        break;
      case 'local': {
        let idx = r.u1();
        end = pc + 2;
        ins.local = idx;
        break;
      }
      case 'iinc':
        ins.local = r.u1();
        ins.iincVal = (r.u1() << 24) >> 24;
        end = pc + 3;
        break;
      case 'branch': {
        const rel = (r.u2() << 16) >> 16;
        ins.branch = pc + rel;
        end = pc + 3;
        break;
      }
      case 'newarray':
        ins.atype = r.u1();
        if (ins.atype < 4 || ins.atype > 11)
          throw new DecodeError(`invalid array type at pc ${pc}`);
        end = pc + 2;
        break;
      case 'invokeinterface':
        ins.cpIndex = r.u2();
        ins.count = r.u1();
        if (r.u1() !== 0 || ins.count === 0)
          throw new DecodeError(`invalid invokeinterface operands at pc ${pc}`);
        end = pc + 5;
        break;
      case 'invokedynamic':
        ins.cpIndex = r.u2();
        if (r.u2() !== 0) throw new DecodeError(`invalid invokedynamic operands at pc ${pc}`);
        end = pc + 5;
        break;
      case 'multianewarray':
        ins.cpIndex = r.u2();
        ins.dims = r.u1();
        end = pc + 4;
        break;
      case 'tableswitch': {
        r.seek(pc + 1 + ((4 - ((pc + 1) % 4)) % 4));
        const dflt = r.s4();
        const low = r.s4();
        const high = r.s4();
        if (high < low || high - low + 1 > Math.floor(r.remaining / 4))
          throw new DecodeError(`invalid tableswitch range at pc ${pc}`);
        ins.switchDefault = pc + dflt;
        ins.switchCases = [];
        for (let v = low; v <= high; v++) {
          ins.switchCases.push({ value: v, target: pc + r.s4() });
        }
        end = r.offset;
        break;
      }
      case 'lookupswitch': {
        r.seek(pc + 1 + ((4 - ((pc + 1) % 4)) % 4));
        const dflt = r.s4();
        const n = r.s4();
        if (n < 0 || n > Math.floor(r.remaining / 8))
          throw new DecodeError(`invalid lookupswitch count at pc ${pc}`);
        ins.switchDefault = pc + dflt;
        ins.switchCases = [];
        for (let i = 0; i < n; i++) {
          const v = r.s4();
          if (i > 0 && v <= ins.switchCases[i - 1].value)
            throw new DecodeError(`unordered lookupswitch keys at pc ${pc}`);
          ins.switchCases.push({ value: v, target: pc + r.s4() });
        }
        end = r.offset;
        break;
      }
    }

    if (op === 0xc4) {
      const wop = r.u1();
      if (![0x15, 0x16, 0x17, 0x18, 0x19, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x84, 0xa9].includes(wop))
        throw new DecodeError(`invalid wide opcode at pc ${pc}`);
      const wname = OPCODES[wop]?.name ?? 'wide_unknown';
      ins.name = `wide ${wname}`;
      if (wop === 0x84) {
        ins.op = wop;
        ins.name = wname;
        ins.local = r.u2();
        ins.iincVal = (r.u2() << 16) >> 16;
        end = r.offset;
      } else {
        ins.op = wop;
        ins.name = wname;
        ins.local = r.u2();
        end = r.offset;
      }
    } else if (op === 0xc8 || op === 0xc9) {
      r.seek(pc + 1);
      const rel = r.s4();
      ins.branch = pc + rel;
      end = pc + 5;
    }

    ins.size = end - pc;
    if (end <= pc) throw new DecodeError(`bad instruction size at ${pc}`);
    out.push(ins);
    r.seek(end);
  }
  return out;
}

export function isBranch(op: number): boolean {
  const info = OPCODES[op];
  if (!info) return false;
  return info.fmt === 'branch' || info.fmt === 'tableswitch' || info.fmt === 'lookupswitch';
}

export function isConditionalBranch(op: number): boolean {
  return (op >= 0x99 && op <= 0xa6) || op === 0xc6 || op === 0xc7;
}

export function isSwitch(op: number): boolean {
  return op === 0xaa || op === 0xab;
}

export function isReturn(op: number): boolean {
  return (op >= 0xac && op <= 0xb1) || op === 0xbf;
}

export function branchSuccessors(ins: Instr): number[] {
  if (isSwitch(ins.op)) {
    const set = new Set<number>();
    if (ins.switchDefault !== undefined) set.add(ins.switchDefault);
    for (const c of ins.switchCases ?? []) set.add(c.target);
    return [...set];
  }
  if (ins.branch !== undefined) return [ins.branch];
  return [];
}
