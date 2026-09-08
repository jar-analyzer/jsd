import { ByteReader } from '../util/bytes.js';
import type { ConstantPool } from './cpool.js';

export type VerificationType =
  { tag: 0 | 1 | 2 | 3 | 4 | 5 | 6 } | { tag: 7; name: string } | { tag: 8; offset: number };
export interface StackMapFrame {
  offset: number;
  chop: number;
  full: boolean;
  locals: VerificationType[];
  stack: VerificationType[];
}

export function parseStackMap(data: Uint8Array, cp: ConstantPool): StackMapFrame[] {
  const rd = new ByteReader(data);
  const readType = (): VerificationType => {
    const tag = rd.u1();
    if (tag <= 6) return { tag: tag as 0 | 1 | 2 | 3 | 4 | 5 | 6 };
    if (tag === 7) return { tag, name: cp.className(rd.u2()) };
    if (tag === 8) return { tag, offset: rd.u2() };
    throw new Error('Invalid StackMapTable verification type');
  };
  const readTypes = (count: number) => Array.from({ length: count }, readType);
  const frames: StackMapFrame[] = [];
  let offset = -1;
  const count = rd.u2();
  for (let i = 0; i < count; i++) {
    const tag = rd.u1();
    let delta: number;
    let chop = 0;
    let full = false;
    let locals: VerificationType[] = [];
    let stack: VerificationType[] = [];
    if (tag <= 63) delta = tag;
    else if (tag <= 127) {
      delta = tag - 64;
      stack = [readType()];
    } else if (tag === 247) {
      delta = rd.u2();
      stack = [readType()];
    } else if (tag >= 248 && tag <= 250) {
      delta = rd.u2();
      chop = 251 - tag;
    } else if (tag === 251) delta = rd.u2();
    else if (tag >= 252 && tag <= 254) {
      delta = rd.u2();
      locals = readTypes(tag - 251);
    } else if (tag === 255) {
      delta = rd.u2();
      full = true;
      locals = readTypes(rd.u2());
      stack = readTypes(rd.u2());
    } else throw new Error('Reserved StackMapTable frame type');
    offset += delta + 1;
    frames.push({ offset, chop, full, locals, stack });
  }
  if (rd.remaining) throw new Error('Trailing StackMapTable data');
  return frames;
}
