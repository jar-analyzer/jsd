import { DynamicClassBuilder, ldc, indy } from './dynamic-class-builder.js';
import { bootstrapDescriptors } from '../src/decompile/bootstrap.js';

export function dynamicFixtures() {
  const cases: {
    name: string;
    bytes: Uint8Array;
    expected: string;
    minJava?: number;
    mode?: 'identity' | 'error' | 'concat' | 'concat-error';
  }[] = [];
  for (const [name, bootstrapName, constantName, descriptor, expected] of [
    ['DynamicNull', 'nullConstant', 'nil', 'Ljava/lang/String;', 'null'],
    ['DynamicIntClass', 'primitiveClass', 'I', 'Ljava/lang/Class;', 'int'],
    ['DynamicVoidClass', 'primitiveClass', 'V', 'Ljava/lang/Class;', 'void'],
    ['DynamicEnum', 'enumConstant', 'RUNNABLE', 'Ljava/lang/Thread$State;', 'RUNNABLE'],
  ] as const) {
    const b = new DynamicClassBuilder(name);
    const bs = b.bootstrap(
      b.handle(
        'java/lang/invoke/ConstantBootstraps',
        bootstrapName,
        bootstrapDescriptors[bootstrapName],
      ),
    );
    const value = b.dynamic(17, bs, constantName, descriptor);
    cases.push({ name, bytes: b.build([...ldc(value), 0xb0], `()${descriptor}`), expected });
  }
  for (const descriptor of ['()V', '(I[Ljava/lang/String;)V']) {
    const name = descriptor === '()V' ? 'EmptyMethodType' : 'ArrayMethodType';
    const b = new DynamicClassBuilder(name);
    const type = b.methodType(descriptor);
    cases.push({
      name,
      bytes: b.build([...ldc(type), 0xb0], '()Ljava/lang/invoke/MethodType;'),
      expected: descriptor === '()V' ? '()void' : '(int,String[])void',
    });
  }
  for (const name of [
    'EmptyConcat',
    'NullConcat',
    'ClassConcat',
    'NestedConstantConcat',
    'MethodTypeConcat',
    'PrimitiveConcat',
  ]) {
    const b = new DynamicClassBuilder(name);
    let args: number[] = [];
    let code: number[] = [];
    let descriptor = '()Ljava/lang/String;';
    let expected = '';
    if (name === 'NullConcat') {
      args = [b.string('\u0001')];
      code = [0x01];
      descriptor = '(Ljava/lang/Object;)Ljava/lang/String;';
      expected = 'null';
    } else if (name === 'ClassConcat') {
      args = [b.string('type=\u0002'), b.classRef('[Ljava/lang/String;')];
      expected = 'type=class [Ljava.lang.String;';
    } else if (name === 'NestedConstantConcat') {
      const primitive = b.bootstrap(
        b.handle(
          'java/lang/invoke/ConstantBootstraps',
          'primitiveClass',
          bootstrapDescriptors.primitiveClass,
        ),
      );
      args = [b.string('\u0002'), b.dynamic(17, primitive, 'I', 'Ljava/lang/Class;')];
      expected = 'int';
    } else if (name === 'MethodTypeConcat') {
      args = [b.string('\u0002'), b.methodType('(I)V')];
      expected = '(int)void';
    } else if (name === 'PrimitiveConcat') {
      args = [b.string('\u0001/\u0001/\u0001')];
      code = [0x04, 0x10, 65, 0x09];
      descriptor = '(ZCJ)Ljava/lang/String;';
      expected = 'true/A/0';
    } else args = [b.string('')];
    const bs = b.bootstrap(
      b.handle(
        'java/lang/invoke/StringConcatFactory',
        'makeConcatWithConstants',
        bootstrapDescriptors.makeConcatWithConstants,
      ),
      args,
    );
    const call = b.dynamic(18, bs, 'concat', descriptor);
    cases.push({
      name,
      bytes: b.build([...code, ...indy(call), 0xb0], '()Ljava/lang/String;'),
      expected,
    });
  }
  for (const name of ['DynamicClassDesc', 'DynamicEnumDesc']) {
    const b = new DynamicClassBuilder(name);
    const invoke = b.handle(
      'java/lang/invoke/ConstantBootstraps',
      'invoke',
      bootstrapDescriptors.invoke,
    );
    const classFactory = b.handle(
      'java/lang/constant/ClassDesc',
      'of',
      '(Ljava/lang/String;)Ljava/lang/constant/ClassDesc;',
      6,
      11,
    );
    const classBootstrap = b.bootstrap(invoke, [classFactory, b.string('java.lang.Thread$State')]);
    let value = b.dynamic(17, classBootstrap, 'invoke', 'Ljava/lang/constant/ClassDesc;');
    let descriptor = 'Ljava/lang/constant/ClassDesc;';
    if (name === 'DynamicEnumDesc') {
      const enumFactory = b.handle(
        'java/lang/Enum$EnumDesc',
        'of',
        '(Ljava/lang/constant/ClassDesc;Ljava/lang/String;)Ljava/lang/Enum$EnumDesc;',
      );
      const enumBootstrap = b.bootstrap(invoke, [enumFactory, value, b.string('NEW')]);
      descriptor = 'Ljava/lang/Enum$EnumDesc;';
      value = b.dynamic(17, enumBootstrap, 'invoke', descriptor);
    }
    cases.push({
      name,
      bytes: b.build([...ldc(value), 0xb0], `()${descriptor}`),
      minJava: 12,
      mode: 'identity',
      expected:
        name === 'DynamicClassDesc' ? 'Ljava/lang/Thread$State;' : 'Ljava/lang/Thread$State;:NEW',
    });
  }
  for (const [name, descriptor, field, declaring, expected] of [
    ['ImplicitFinal', 'I', 'MAX_VALUE', '', '2147483647'],
    ['WideFinal', 'J', 'MAX_VALUE', 'java/lang/Long', '9223372036854775807'],
    ['ExplicitFinal', 'Ljava/lang/Boolean;', 'TRUE', 'java/lang/Boolean', 'true'],
  ]) {
    const b = new DynamicClassBuilder(name);
    const bs = b.bootstrap(
      b.handle(
        'java/lang/invoke/ConstantBootstraps',
        'getStaticFinal',
        declaring
          ? bootstrapDescriptors.getStaticFinalExplicit
          : bootstrapDescriptors.getStaticFinal,
      ),
      declaring ? [b.classRef(declaring)] : [],
    );
    const value = b.dynamic(17, bs, field, descriptor);
    cases.push({
      name,
      expected,
      bytes: b.build(
        [
          ...(descriptor === 'J' ? [0x14, value >> 8, value & 255] : ldc(value)),
          descriptor === 'I' ? 0xac : descriptor === 'J' ? 0xad : 0xb0,
        ],
        `()${descriptor}`,
      ),
    });
  }
  for (const name of ['EmptyLambdaBridges']) {
    const b = new DynamicClassBuilder(name);
    const sam = b.methodType('()Ljava/lang/Object;');
    const impl = b.handle('java/util/Collections', 'emptyList', '()Ljava/util/List;');
    const instantiated = b.methodType('()Ljava/util/List;');
    const bs = b.bootstrap(
      b.handle(
        'java/lang/invoke/LambdaMetafactory',
        'altMetafactory',
        bootstrapDescriptors.altMetafactory,
      ),
      [sam, impl, instantiated, b.integer(4), b.integer(0)],
    );
    const call = b.dynamic(18, bs, 'get', '()Ljava/util/function/Supplier;');
    cases.push({
      name,
      expected: '[]',
      bytes: b.build([...indy(call), 0xb0], '()Ljava/util/function/Supplier;'),
    });
  }
  for (const [name, method, field, descriptor, expected] of [
    ['MissingFinal', 'getStaticFinal', 'MISSING', 'I', 'java.lang.NoSuchFieldError'],
    [
      'MissingEnum',
      'enumConstant',
      'MISSING',
      'Ljava/lang/Thread$State;',
      'java.lang.BootstrapMethodError',
    ],
  ] as const) {
    const b = new DynamicClassBuilder(name);
    const bs = b.bootstrap(
      b.handle('java/lang/invoke/ConstantBootstraps', method, bootstrapDescriptors[method]),
    );
    const value = b.dynamic(17, bs, field, descriptor);
    cases.push({
      name,
      expected,
      mode: 'error',
      bytes: b.build([...ldc(value), descriptor === 'I' ? 0xac : 0xb0], `()${descriptor}`),
    });
  }
  for (const [name, restart, expected, mode] of [
    ['SwitchRestart', 1, '1', undefined],
    ['SwitchExhausted', 2, '2', undefined],
    ['SwitchInvalidRestart', -1, 'java.lang.IndexOutOfBoundsException', 'error'],
  ] as const) {
    const b = new DynamicClassBuilder(name);
    const bs = b.bootstrap(
      b.handle('java/lang/runtime/SwitchBootstraps', 'typeSwitch', bootstrapDescriptors.typeSwitch),
      [b.classRef('java/lang/String'), b.classRef('java/lang/String')],
    );
    const call = b.dynamic(18, bs, 'typeSwitch', '(Ljava/lang/Object;I)I');
    cases.push({
      name,
      expected,
      mode,
      minJava: 21,
      bytes: b.build(
        [...ldc(b.string('test')), ...ldc(b.integer(restart)), ...indy(call), 0xac],
        '()I',
      ),
    });
  }
  {
    const name = 'CapturedLocalSnapshot';
    const b = new DynamicClassBuilder(name);
    const bs = b.bootstrap(
      b.handle(
        'java/lang/invoke/LambdaMetafactory',
        'metafactory',
        bootstrapDescriptors.metafactory,
      ),
      [
        b.methodType('()Ljava/lang/Object;'),
        b.handle('java/lang/String', 'trim', '()Ljava/lang/String;', 5),
        b.methodType('()Ljava/lang/String;'),
      ],
    );
    const call = b.dynamic(18, bs, 'get', '(Ljava/lang/String;)Ljava/util/function/Supplier;');
    cases.push({
      name,
      expected: 'before',
      bytes: b.build(
        [
          ...ldc(b.string(' before ')),
          0x4b,
          0x2a,
          ...indy(call),
          0x4c,
          ...ldc(b.string('after')),
          0x4b,
          0x2b,
          0xb0,
        ],
        '()Ljava/util/function/Supplier;',
      ),
    });
  }
  for (const name of [
    'ConcatStaticOnce',
    'ConcatSeparateSites',
    'ConcatConversionFailure',
    'ConcatNullFinal',
  ]) {
    const b = new DynamicClassBuilder(name);
    const valueBootstrap = b.bootstrap(
      b.handle(
        'java/lang/invoke/ConstantBootstraps',
        'getStaticFinal',
        bootstrapDescriptors.getStaticFinalExplicit,
      ),
      [b.classRef('ConcatState')],
    );
    const constant = b.dynamic(
      17,
      valueBootstrap,
      name === 'ConcatNullFinal' ? 'NULL_VALUE' : 'VALUE',
      'Ljava/lang/Object;',
    );
    const concatBootstrap = b.bootstrap(
      b.handle(
        'java/lang/invoke/StringConcatFactory',
        'makeConcatWithConstants',
        bootstrapDescriptors.makeConcatWithConstants,
      ),
      [b.string('\u0002'), constant],
    );
    const call = b.dynamic(18, concatBootstrap, 'concat', '()Ljava/lang/String;');
    let code = indy(call);
    if (name === 'ConcatSeparateSites') {
      const joinBootstrap = b.bootstrap(
        b.handle(
          'java/lang/invoke/StringConcatFactory',
          'makeConcatWithConstants',
          bootstrapDescriptors.makeConcatWithConstants,
        ),
        [b.string('\u0001/\u0001')],
      );
      const join = b.dynamic(
        18,
        joinBootstrap,
        'concat',
        '(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;',
      );
      code = [...code, ...indy(call), ...indy(join)];
    }
    cases.push({
      name,
      bytes: b.build([...code, 0xb0], '()Ljava/lang/String;'),
      mode:
        name === 'ConcatConversionFailure'
          ? 'concat-error'
          : name === 'ConcatNullFinal'
            ? 'error'
            : 'concat',
      expected:
        name === 'ConcatStaticOnce'
          ? 'before:1|before:1|1'
          : name === 'ConcatSeparateSites'
            ? 'before:1/before:2|before:1/before:2|2'
            : name === 'ConcatNullFinal'
              ? 'java.lang.BootstrapMethodError'
              : 'java.lang.BootstrapMethodError:1',
    });
  }
  return cases;
}
