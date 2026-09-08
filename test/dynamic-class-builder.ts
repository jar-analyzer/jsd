const u2 = (n: number) => [(n >>> 8) & 255, n & 255];
const u4 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

export class DynamicClassBuilder {
  entries: number[][] = [];
  bootstraps: { handle: number; args: number[] }[] = [];
  constructor(readonly name = 'DynamicFixture') {}
  entry(tag: number, ...bytes: number[]): number {
    this.entries.push([tag, ...bytes]);
    return this.entries.length;
  }
  utf8(value: string): number {
    const bytes: number[] = [];
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c > 0 && c < 128) bytes.push(c);
      else if (c < 2048) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return this.entry(1, ...u2(bytes.length), ...bytes);
  }
  classRef(name: string): number {
    return this.entry(7, ...u2(this.utf8(name)));
  }
  string(value: string): number {
    return this.entry(8, ...u2(this.utf8(value)));
  }
  integer(value: number): number {
    return this.entry(3, ...u4(value));
  }
  methodType(descriptor: string): number {
    return this.entry(16, ...u2(this.utf8(descriptor)));
  }
  handle(owner: string, name: string, descriptor: string, kind = 6, tag = 10): number {
    const cls = this.classRef(owner);
    const nat = this.entry(12, ...u2(this.utf8(name)), ...u2(this.utf8(descriptor)));
    const ref = this.entry(tag, ...u2(cls), ...u2(nat));
    return this.entry(15, kind, ...u2(ref));
  }
  bootstrap(handle: number, args: number[] = []): number {
    this.bootstraps.push({ handle, args });
    return this.bootstraps.length - 1;
  }
  dynamic(tag: 17 | 18, bsm: number, name: string, descriptor: string): number {
    const nat = this.entry(12, ...u2(this.utf8(name)), ...u2(this.utf8(descriptor)));
    return this.entry(tag, ...u2(bsm), ...u2(nat));
  }
  build(code: number[], descriptor: string): Uint8Array {
    const self = this.classRef(this.name),
      parent = this.classRef('java/lang/Object');
    const method = this.utf8('value'),
      desc = this.utf8(descriptor),
      codeName = this.utf8('Code');
    const bootstrapName = this.utf8('BootstrapMethods');
    const body = [...u2(16), ...u2(16), ...u4(code.length), ...code, ...u2(0), ...u2(0)];
    const bootstraps = [
      ...u2(this.bootstraps.length),
      ...this.bootstraps.flatMap((b) => [
        ...u2(b.handle),
        ...u2(b.args.length),
        ...b.args.flatMap(u2),
      ]),
    ];
    return Uint8Array.from([
      0xca,
      0xfe,
      0xba,
      0xbe,
      ...u2(0),
      ...u2(55),
      ...u2(this.entries.length + 1),
      ...this.entries.flat(),
      ...u2(0x21),
      ...u2(self),
      ...u2(parent),
      ...u2(0),
      ...u2(0),
      ...u2(1),
      ...u2(9),
      ...u2(method),
      ...u2(desc),
      ...u2(1),
      ...u2(codeName),
      ...u4(body.length),
      ...body,
      ...u2(1),
      ...u2(bootstrapName),
      ...u4(bootstraps.length),
      ...bootstraps,
    ]);
  }
}
export const ldc = (index: number) => [0x13, ...u2(index)];
export const indy = (index: number) => [0xba, ...u2(index), 0, 0];
