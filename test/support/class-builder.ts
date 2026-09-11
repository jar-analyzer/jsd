export function classBytes(
  name: string,
  methods: {
    name: string;
    descriptor?: string;
    maxLocals?: number;
    access?: number;
    code: number[];
  }[],
  outer?: string,
  innerAccess = 0x0009,
): Uint8Array {
  const u2 = (n: number): number[] => [(n >>> 8) & 255, n & 255];
  const u4 = (n: number): number[] => [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ];
  const cp: number[][] = [];
  const utf8 = (s: string): number => {
    const bytes = new TextEncoder().encode(s);
    cp.push([1, ...u2(bytes.length), ...bytes]);
    return cp.length;
  };
  const cls = (n: string): number => {
    const index = utf8(n);
    cp.push([7, ...u2(index)]);
    return cp.length;
  };
  const thisClass = cls(name),
    superClass = cls('java/lang/Object'),
    codeName = utf8('Code');
  const encodedMethods = methods.flatMap((m) => {
    const methodName = utf8(m.name),
      descriptor = utf8(m.descriptor ?? '()I');
    const body = [
      ...u2(8),
      ...u2(m.maxLocals ?? 8),
      ...u4(m.code.length),
      ...m.code,
      ...u2(0),
      ...u2(0),
    ];
    return [
      ...u2(m.access ?? 0x0009),
      ...u2(methodName),
      ...u2(descriptor),
      ...u2(1),
      ...u2(codeName),
      ...u4(body.length),
      ...body,
    ];
  });
  let attrs = u2(0);
  if (outer) {
    const attrName = utf8('InnerClasses'),
      outerClass = cls(outer),
      innerName = utf8(name.slice(name.lastIndexOf('$') + 1));
    attrs = [
      ...u2(1),
      ...u2(attrName),
      ...u4(10),
      ...u2(1),
      ...u2(thisClass),
      ...u2(outerClass),
      ...u2(innerName),
      ...u2(innerAccess),
    ];
  }
  return Uint8Array.from([
    0xca,
    0xfe,
    0xba,
    0xbe,
    ...u2(0),
    ...u2(52),
    ...u2(cp.length + 1),
    ...cp.flat(),
    ...u2(0x0021),
    ...u2(thisClass),
    ...u2(superClass),
    ...u2(0),
    ...u2(0),
    ...u2(methods.length),
    ...encodedMethods,
    ...attrs,
  ]);
}

export function moduleBytes(): Uint8Array {
  const u2 = (n: number) => [n >> 8, n & 255];
  const utf = (s: string) => [1, ...u2(s.length), ...new TextEncoder().encode(s)];
  return Uint8Array.from([
    0xca,
    0xfe,
    0xba,
    0xbe,
    0,
    0,
    0,
    53,
    0,
    8,
    ...utf('module-info'),
    7,
    0,
    1,
    ...utf('Module'),
    ...utf('m'),
    19,
    0,
    4,
    ...utf('java.base'),
    19,
    0,
    6,
    0x80,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    3,
    0,
    0,
    0,
    22,
    0,
    5,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    7,
    0x80,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
}
