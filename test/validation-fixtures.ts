import { DynamicClassBuilder, ldc } from './dynamic-class-builder.js';

const u2 = (n: number) => [(n >>> 8) & 255, n & 255];
const u4 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

export function validationFixtures(): { name: string; bytes: Uint8Array }[] {
  const out: { name: string; bytes: Uint8Array }[] = [];
  const add = (name: string, code: number[], descriptor = '()I', options = {}) => {
    out.push({ name, bytes: new DynamicClassBuilder(name).build(code, descriptor, options) });
  };
  add('InvalidFrameLocal', [4, 59, 167, 0, 3, 26, 172], '()I', {
    stackMap: [0, 1, 255, 0, 5, 0, 1, 2, 0, 0],
  });
  add('InvalidFrameMiddle', [4, 172], '()I', { stackMap: [0, 1, 65, 2] });
  {
    const b = new DynamicClassBuilder('InvalidFrameReference');
    const value = b.string('text'),
      expected = b.classRef('java/lang/Integer');
    out.push({
      name: b.name,
      bytes: b.build([...ldc(value), 167, 0, 3, 176], '()Ljava/lang/Object;', {
        stackMap: [0, 1, 255, 0, 6, 0, 0, 0, 1, 7, ...u2(expected)],
      }),
    });
  }
  for (const mismatch of [true, false]) {
    const b = new DynamicClassBuilder(
      mismatch ? 'InvalidConstructorOwner' : 'InvalidInitializedFrame',
    );
    const owner = b.classRef('java/lang/Object');
    const invoked = mismatch ? b.classRef('java/lang/String') : owner;
    const nat = b.entry(12, ...u2(b.utf8('<init>')), ...u2(b.utf8('()V')));
    const init = b.entry(10, ...u2(invoked), ...u2(nat));
    out.push({
      name: b.name,
      bytes: b.build(
        [187, ...u2(owner), 89, 183, ...u2(init), 167, 0, 3, 176],
        '()Ljava/lang/Object;',
        { stackMap: [0, 1, 255, 0, 10, 0, 0, 0, 1, 8, 0, 0] },
      ),
    });
  }
  for (const [name, exception] of [
    ['InvalidExceptionStart', [1, 3, 3, 0]],
    ['InvalidExceptionEnd', [0, 1, 3, 0]],
    ['InvalidExceptionHandler', [0, 3, 1, 0]],
    ['InvalidExceptionEmpty', [0, 0, 3, 0]],
    ['InvalidExceptionOutside', [0, 5, 3, 0]],
  ] as const)
    add(name, [16, 1, 87, 177], '()V', { exceptions: [exception] });
  for (const [name, low, high] of [
    ['InvalidTableRange', 2, 1],
    ['InvalidTableCount', -2147483648, 2147483647],
  ] as const)
    add(name, [3, 170, 0, 0, ...u4(0), ...u4(low), ...u4(high)]);
  add('InvalidLookupCount', [3, 171, 0, 0, ...u4(0), ...u4(-1)]);
  for (const [name, second] of [
    ['InvalidLookupOrder', 0],
    ['InvalidLookupDuplicate', 1],
  ] as const)
    add(name, [
      3,
      171,
      0,
      0,
      ...u4(27),
      ...u4(2),
      ...u4(1),
      ...u4(27),
      ...u4(second),
      ...u4(27),
      3,
      172,
    ]);
  {
    const b = new DynamicClassBuilder('InvalidInterfaceReserved');
    const owner = b.classRef('java/lang/Runnable');
    const nat = b.entry(12, ...u2(b.utf8('run')), ...u2(b.utf8('()V')));
    const method = b.entry(11, ...u2(owner), ...u2(nat));
    out.push({ name: b.name, bytes: b.build([1, 185, ...u2(method), 1, 1, 177], '()V') });
  }
  {
    const b = new DynamicClassBuilder('InvalidDynamicReserved');
    const h = b.handle(
      'java/lang/invoke/StringConcatFactory',
      'makeConcat',
      '(Ljava/lang/invoke/MethodHandles$Lookup;Ljava/lang/String;Ljava/lang/invoke/MethodType;)Ljava/lang/invoke/CallSite;',
    );
    const call = b.dynamic(18, b.bootstrap(h), 'concat', '()Ljava/lang/String;');
    out.push({
      name: b.name,
      bytes: b.build([186, ...u2(call), 0, 1, 176], '()Ljava/lang/String;'),
    });
  }
  return out;
}
