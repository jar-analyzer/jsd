import { ByteReader } from '../util/bytes.js';
import type { MemberRef, MethodHandleRef } from './model.js';

const TAG = {
  Utf8: 1,
  Integer: 3,
  Float: 4,
  Long: 5,
  Double: 6,
  Class: 7,
  String: 8,
  Fieldref: 9,
  Methodref: 10,
  InterfaceMethodref: 11,
  NameAndType: 12,
  MethodHandle: 15,
  MethodType: 16,
  Dynamic: 17,
  InvokeDynamic: 18,
  Module: 19,
  Package: 20,
} as const;

type CpEntry =
  | { tag: 1; str: string }
  | { tag: 3; int: number }
  | { tag: 4; float: number; rawBits: number }
  | { tag: 5; long: bigint }
  | { tag: 6; double: number }
  | { tag: 7; nameIdx: number }
  | { tag: 8; utf8Idx: number }
  | { tag: 9 | 10 | 11; classIdx: number; natIdx: number }
  | { tag: 12; nameIdx: number; descIdx: number }
  | { tag: 15; kind: number; refIdx: number }
  | { tag: 16; descIdx: number }
  | { tag: 17 | 18; bsmIdx: number; natIdx: number }
  | { tag: 19 | 20; nameIdx: number }
  | { tag: 100; padding: true };

export function bitsToF32(b: Uint8Array): number {
  const buf = new ArrayBuffer(4);
  new Uint8Array(buf).set(b);
  return new DataView(buf).getFloat32(0, false);
}
export function bitsToF64(b: Uint8Array): number {
  const buf = new ArrayBuffer(8);
  new Uint8Array(buf).set(b);
  return new DataView(buf).getFloat64(0, false);
}

export class ConstantPool {
  private entries: CpEntry[] = [];
  constructor(r: ByteReader) {
    const count = r.u2();
    this.entries = new Array(count);
    let i = 1;
    while (i < count) {
      const tag = r.u1();
      switch (tag) {
        case TAG.Utf8:
          this.entries[i] = { tag: 1, str: r.modifiedUtf8(r.bytes(r.u2())) };
          i++;
          break;
        case TAG.Integer:
          this.entries[i] = { tag: 3, int: r.s4() };
          i++;
          break;
        case TAG.Float: {
          const bytes = r.bytes(4);
          const rawBits = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
          this.entries[i] = { tag: 4, float: bitsToF32(bytes), rawBits };
          i++;
          break;
        }
        case TAG.Long: {
          const hi = r.u4() >>> 0;
          const lo = r.u4() >>> 0;
          this.entries[i] = { tag: 5, long: BigInt.asIntN(64, (BigInt(hi) << 32n) | BigInt(lo)) };
          this.entries[i + 1] = { tag: 100, padding: true };
          i += 2;
          break;
        }
        case TAG.Double:
          this.entries[i] = { tag: 6, double: bitsToF64(r.bytes(8)) };
          this.entries[i + 1] = { tag: 100, padding: true };
          i += 2;
          break;
        case TAG.Class:
          this.entries[i] = { tag: 7, nameIdx: r.u2() };
          i++;
          break;
        case TAG.String:
          this.entries[i] = { tag: 8, utf8Idx: r.u2() };
          i++;
          break;
        case TAG.Fieldref:
        case TAG.Methodref:
        case TAG.InterfaceMethodref:
          this.entries[i] = { tag, classIdx: r.u2(), natIdx: r.u2() };
          i++;
          break;
        case TAG.NameAndType:
          this.entries[i] = { tag: 12, nameIdx: r.u2(), descIdx: r.u2() };
          i++;
          break;
        case TAG.MethodHandle:
          this.entries[i] = { tag: 15, kind: r.u1(), refIdx: r.u2() };
          i++;
          break;
        case TAG.MethodType:
          this.entries[i] = { tag: 16, descIdx: r.u2() };
          i++;
          break;
        case TAG.Dynamic:
        case TAG.InvokeDynamic:
          this.entries[i] = { tag, bsmIdx: r.u2(), natIdx: r.u2() };
          i++;
          break;
        case TAG.Module:
        case TAG.Package:
          this.entries[i] = { tag: 19, nameIdx: r.u2() };
          i++;
          break;
        default:
          throw new Error(`unknown constant pool tag ${tag} at index ${i}`);
      }
    }
  }

  private e(i: number): CpEntry {
    if (i <= 0 || i >= this.entries.length) throw new Error(`invalid cp index ${i}`);
    return this.entries[i];
  }
  utf8(i: number): string {
    const x = this.e(i);
    if (x.tag !== 1) throw new Error(`cp[${i}] is not Utf8`);
    return x.str;
  }
  className(i: number): string {
    const x = this.e(i);
    if (x.tag !== 7 && x.tag !== 19 && x.tag !== 20) throw new Error(`cp[${i}] is not Class`);
    return this.utf8((x as { nameIdx: number }).nameIdx);
  }
  nat(i: number): { name: string; descriptor: string } {
    const x = this.e(i);
    if (x.tag !== 12) throw new Error(`cp[${i}] is not NameAndType`);
    return { name: this.utf8(x.nameIdx), descriptor: this.utf8(x.descIdx) };
  }
  memberRef(i: number): MemberRef {
    const x = this.e(i) as { tag: 9 | 10 | 11; classIdx: number; natIdx: number };
    if (x.tag !== 9 && x.tag !== 10 && x.tag !== 11) throw new Error(`cp[${i}] is not a ref`);
    if (this.e(x.classIdx).tag !== 7) throw new Error(`cp[${i}] member owner is not Class`);
    const nat = this.nat(x.natIdx);
    return { owner: this.className(x.classIdx), name: nat.name, descriptor: nat.descriptor };
  }
  methodHandle(i: number): MethodHandleRef {
    const x = this.e(i);
    if (x.tag !== 15) throw new Error(`cp[${i}] is not MethodHandle`);
    const target = this.e(x.refIdx);
    const valid =
      x.kind >= 1 && x.kind <= 4
        ? target.tag === 9
        : x.kind === 5 || x.kind === 8
          ? target.tag === 10
          : x.kind === 6 || x.kind === 7
            ? target.tag === 10 || target.tag === 11
            : x.kind === 9 && target.tag === 11;
    if (!valid) throw new Error(`invalid method handle kind/reference at cp[${i}]`);
    const ref = this.memberRef(x.refIdx);
    if (
      x.kind >= 5 &&
      (x.kind === 8 ? ref.name !== '<init>' : ref.name === '<init>' || ref.name === '<clinit>')
    )
      throw new Error(`invalid method handle member name at cp[${i}]`);
    return { kind: x.kind, referenceTag: target.tag as 9 | 10 | 11, ref };
  }
  methodType(i: number): string {
    const x = this.e(i);
    if (x.tag !== 16) throw new Error(`cp[${i}] is not MethodType`);
    return this.utf8(x.descIdx);
  }
  dynamic(
    i: number,
    expected?: 'constant' | 'callsite',
  ): { bsm: number; name: string; descriptor: string } {
    const x = this.e(i) as { tag: 17 | 18; bsmIdx: number; natIdx: number };
    if (x.tag !== 17 && x.tag !== 18) throw new Error(`cp[${i}] is not Dynamic`);
    if (expected && x.tag !== (expected === 'constant' ? 17 : 18))
      throw new Error(`cp[${i}] has the wrong dynamic constant kind`);
    const nat = this.nat(x.natIdx);
    return { bsm: x.bsmIdx, name: nat.name, descriptor: nat.descriptor };
  }
  constVal(i: number): {
    rawBits?: number;
    type: string;
    value: number | string | bigint | boolean | undefined;
  } {
    const x = this.e(i);
    switch (x.tag) {
      case 3:
        return { type: 'int', value: x.int };
      case 4:
        return { type: 'float', value: x.float, rawBits: x.rawBits };
      case 5:
        return { type: 'long', value: x.long };
      case 6:
        return { type: 'double', value: x.double };
      case 7:
        return { type: 'class', value: this.className(i) };
      case 8:
        return { type: 'string', value: this.utf8(x.utf8Idx) };
      case 15:
        return { type: 'methodhandle', value: '' };
      case 16:
        return { type: 'methodtype', value: this.methodType(i) };
      case 19:
        return { type: 'module', value: this.className(i) };
      case 20:
        return { type: 'package', value: this.className(i) };
      case 17: {
        const d = this.dynamic(i);
        return { type: 'dynamic', value: `${d.name}:${d.descriptor}` };
      }
      default:
        throw new Error(`cp[${i}] tag ${x.tag} is not loadable`);
    }
  }
}
