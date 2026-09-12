import test from 'node:test';
import assert from 'node:assert/strict';
import { decompileClassFile, parseClass } from '../../../src/index.js';
import { bootstrapDescriptors } from '../../../src/decompile/bootstrap.js';
import { DynamicClassBuilder, ldc, indy } from '../../support/dynamic-class-builder.js';

const concatOwner = 'java/lang/invoke/StringConcatFactory';
const constantOwner = 'java/lang/invoke/ConstantBootstraps';

for (const [owner, name] of [
  [concatOwner, 'makeConcat'],
  [concatOwner, 'makeConcatWithConstants'],
  ['java/lang/invoke/LambdaMetafactory', 'metafactory'],
  ['java/lang/invoke/LambdaMetafactory', 'altMetafactory'],
  ['java/lang/runtime/SwitchBootstraps', 'typeSwitch'],
  ['java/lang/runtime/SwitchBootstraps', 'enumSwitch'],
  ['java/lang/runtime/ObjectMethods', 'bootstrap'],
] as const) {
  for (const mutation of ['owner', 'descriptor', 'kind', 'reference-tag'] as const) {
    test(`${name} does not recognize a bootstrap with a different ${mutation}`, () => {
      const b = new DynamicClassBuilder();
      const descriptor = bootstrapDescriptors[name === 'bootstrap' ? 'record' : name];
      const handle = b.handle(
        mutation === 'owner' ? 'custom/Factory' : owner,
        name,
        mutation === 'descriptor' ? '()Ljava/lang/invoke/CallSite;' : descriptor,
        mutation === 'kind' ? 5 : 6,
        mutation === 'reference-tag' ? 11 : 10,
      );
      const bs = b.bootstrap(handle);
      const call = b.dynamic(18, bs, 'value', '()Ljava/lang/String;');
      const result = decompileClassFile(b.build([...indy(call), 0xb0], '()Ljava/lang/String;'));
      assert.equal(result.status, 'partial');
      assert.ok(
        result.diagnostics.some(
          (d) => d.code === 'UNSUPPORTED_INVOKEDYNAMIC' && d.bytecodeOffset === 0,
        ),
      );
      assert.match(result.source, /decompilation failed/);
      assert.doesNotMatch(result.source, /return\s*\/\* invokedynamic/);
    });
  }
}

test('concat preserves zero arguments, nullable references and literal control characters', () => {
  for (const [recipe, args, code, descriptor] of [
    ['', [], [], '()Ljava/lang/String;'],
    ['\u0001', [], [0x01], '()Ljava/lang/String;'],
    ['value=\u0002', ['\u0001\u0002'], [], '()Ljava/lang/String;'],
  ] as [string, string[], number[], string][]) {
    const b = new DynamicClassBuilder();
    const bs = b.bootstrap(
      b.handle(
        concatOwner,
        'makeConcatWithConstants',
        bootstrapDescriptors.makeConcatWithConstants,
      ),
      [b.string(recipe), ...args.map((a) => b.string(a))],
    );
    const call = b.dynamic(
      18,
      bs,
      'concat',
      code.length ? '(Ljava/lang/Object;)Ljava/lang/String;' : descriptor,
    );
    const result = decompileClassFile(b.build([...code, ...indy(call), 0xb0], descriptor));
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    if (!recipe) assert.match(result.source, /return "";/);
    if (code.length) assert.match(result.source, /"" \+ null/);
  }
});

test('concat rejects missing recipes and mismatched placeholder counts', () => {
  for (const recipe of [null, '\u0001', '\u0002']) {
    const b = new DynamicClassBuilder();
    const bs = b.bootstrap(
      b.handle(
        concatOwner,
        'makeConcatWithConstants',
        bootstrapDescriptors.makeConcatWithConstants,
      ),
      recipe === null ? [] : [b.string(recipe)],
    );
    const call = b.dynamic(18, bs, 'concat', '()Ljava/lang/String;');
    const result = decompileClassFile(b.build([...indy(call), 0xb0], '()Ljava/lang/String;'));
    assert.equal(result.status, 'partial');
    assert.ok(result.diagnostics.some((d) => d.code === 'INVALID_BOOTSTRAP'));
  }
});

test('bootstrap class arguments preserve their type, including arrays', () => {
  const b = new DynamicClassBuilder();
  const bs = b.bootstrap(
    b.handle(concatOwner, 'makeConcatWithConstants', bootstrapDescriptors.makeConcatWithConstants),
    [b.string('\u0002'), b.classRef('[Ljava/lang/String;')],
  );
  const call = b.dynamic(18, bs, 'concat', '()Ljava/lang/String;');
  const result = decompileClassFile(b.build([...indy(call), 0xb0], '()Ljava/lang/String;'));
  assert.equal(result.status, 'success');
  assert.match(result.source, /String\[\]\.class/);
  assert.doesNotMatch(result.source, /undefined/);
});

test('MethodType constants produce a typed methodType factory expression', () => {
  const b = new DynamicClassBuilder();
  const index = b.methodType('(I[Ljava/lang/String;)V');
  const result = decompileClassFile(
    b.build([...ldc(index), 0xb0], '()Ljava/lang/invoke/MethodType;'),
  );
  assert.equal(result.status, 'success');
  assert.match(
    result.source,
    /MethodType.methodType\(void.class, new Class\[\] \{int.class, String\[\].class\}\)/,
  );
});

test('MethodHandle constants retain target information in a diagnostic', () => {
  const b = new DynamicClassBuilder();
  const index = b.handle('java/lang/Integer', 'valueOf', '(I)Ljava/lang/Integer;');
  const result = decompileClassFile(
    b.build([...ldc(index), 0xb0], '()Ljava/lang/invoke/MethodHandle;'),
  );
  assert.equal(result.status, 'partial');
  const diagnostic = result.diagnostics.find((d) => d.code === 'UNSUPPORTED_CONSTANT');
  assert.equal(diagnostic?.bytecodeOffset, 0);
  assert.match(diagnostic!.message, /java\/lang\/Integer.valueOf\(I\)Ljava\/lang\/Integer;/);
});

for (const [name, constantName, descriptor, source] of [
  ['nullConstant', 'nil', 'Ljava/lang/String;', /return null;/],
  ['primitiveClass', 'I', 'Ljava/lang/Class;', /return int.class;/],
  ['primitiveClass', 'V', 'Ljava/lang/Class;', /return void.class;/],
  [
    'enumConstant',
    'RUNNABLE',
    'Ljava/lang/Thread$State;',
    /\(State\) \(\(Object\) ConstantBootstraps\.enumConstant\(\s*MethodHandles\.lookup\(\),\s*"RUNNABLE",\s*State.class\s*\)\)/,
  ],
] as const) {
  test(`ConstantDynamic ${name}/${constantName} restores its Java expression`, () => {
    const b = new DynamicClassBuilder();
    const bs = b.bootstrap(b.handle(constantOwner, name, bootstrapDescriptors[name]));
    const index = b.dynamic(17, bs, constantName, descriptor);
    const result = decompileClassFile(b.build([...ldc(index), 0xb0], `()${descriptor}`));
    assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
    assert.match(result.source, source);
  });
}

test('nested dynamic bootstrap arguments remain references and can resolve standard constants', () => {
  const b = new DynamicClassBuilder();
  const primitive = b.bootstrap(
    b.handle(constantOwner, 'primitiveClass', bootstrapDescriptors.primitiveClass),
  );
  const value = b.dynamic(17, primitive, 'I', 'Ljava/lang/Class;');
  const concat = b.bootstrap(
    b.handle(concatOwner, 'makeConcatWithConstants', bootstrapDescriptors.makeConcatWithConstants),
    [b.string('\u0002'), value],
  );
  const call = b.dynamic(18, concat, 'concat', '()Ljava/lang/String;');
  const bytes = b.build([...indy(call), 0xb0], '()Ljava/lang/String;');
  const cls = parseClass(bytes);
  assert.deepEqual(cls.bootstrapMethods[concat].args[1], {
    kind: 'dynamic',
    index: value,
    bsm: primitive,
    name: 'I',
    descriptor: 'Ljava/lang/Class;',
  });
  const result = decompileClassFile(bytes);
  assert.equal(result.status, 'success');
  assert.match(result.source, /int.class/);
});

test('unknown and cyclic dynamic constants fail with a bytecode location', () => {
  for (const cyclic of [false, true]) {
    const b = new DynamicClassBuilder();
    const bs = b.bootstrap(
      b.handle(
        'custom/Bootstrap',
        'value',
        '(Ljava/lang/invoke/MethodHandles$Lookup;Ljava/lang/String;Ljava/lang/Class;[Ljava/lang/Object;)Ljava/lang/Object;',
      ),
    );
    const value = b.dynamic(17, bs, 'unknown', 'Ljava/lang/Object;');
    if (cyclic) b.bootstraps[bs].args.push(value);
    const result = decompileClassFile(b.build([...ldc(value), 0xb0], '()Ljava/lang/Object;'));
    assert.equal(result.status, 'partial');
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.code === (cyclic ? 'INVALID_BOOTSTRAP' : 'UNSUPPORTED_CONSTANT') &&
          d.bytecodeOffset === 0,
      ),
    );
  }
});

test('ldc distinguishes dynamic constants from call sites and rejects category mismatches', () => {
  for (const [tag, descriptor, load] of [
    [18, '()I', ldc],
    [17, 'J', ldc],
    [17, 'Ljava/lang/Object;', (i: number) => [0x14, i >> 8, i & 255]],
  ] as const) {
    const b = new DynamicClassBuilder();
    const bs = b.bootstrap(
      b.handle(constantOwner, 'nullConstant', bootstrapDescriptors.nullConstant),
    );
    const value = b.dynamic(tag, bs, 'value', descriptor);
    assert.equal(
      decompileClassFile(b.build([...load(value), 0xb0], '()Ljava/lang/Object;')).status,
      'partial',
    );
  }
  const b = new DynamicClassBuilder();
  const bs = b.bootstrap(b.handle(concatOwner, 'makeConcat', bootstrapDescriptors.makeConcat));
  const value = b.dynamic(17, bs, 'value', '()Ljava/lang/String;');
  assert.equal(
    decompileClassFile(b.build([...indy(value), 0xb0], '()Ljava/lang/String;')).status,
    'partial',
  );
});

test('malformed method handle kinds are rejected during bootstrap parsing', () => {
  const b = new DynamicClassBuilder();
  b.bootstrap(b.handle('Bad', 'field', 'I', 6, 9));
  assert.throws(() => parseClass(b.build([0xb1], '()V')), /invalid method handle/);
});

test('makeConcat handles reference and primitive arguments without a recipe', () => {
  const b = new DynamicClassBuilder();
  const bs = b.bootstrap(b.handle(concatOwner, 'makeConcat', bootstrapDescriptors.makeConcat));
  const call = b.dynamic(18, bs, 'concat', '(Ljava/lang/Object;I)Ljava/lang/String;');
  const result = decompileClassFile(
    b.build([0x01, 0x04, ...indy(call), 0xb0], '()Ljava/lang/String;'),
  );
  assert.equal(result.status, 'success');
  assert.match(result.source, /"" \+ null \+ 1/);
});

test('lambda bootstrap arguments are validated in order and unsupported flags are diagnosed', () => {
  for (const variant of ['missing', 'wrong-order', 'flags']) {
    const b = new DynamicClassBuilder();
    const name = variant === 'flags' ? 'altMetafactory' : 'metafactory';
    const sam = b.methodType('()Ljava/lang/Object;');
    const handle = b.handle('java/lang/System', 'getProperties', '()Ljava/util/Properties;');
    const instantiated = b.methodType('()Ljava/util/Properties;');
    const args =
      variant === 'missing'
        ? []
        : variant === 'wrong-order'
          ? [handle, sam, instantiated]
          : [sam, handle, instantiated, b.integer(8)];
    const bs = b.bootstrap(
      b.handle('java/lang/invoke/LambdaMetafactory', name, bootstrapDescriptors[name]),
      args,
    );
    const call = b.dynamic(18, bs, 'get', '()Ljava/util/function/Supplier;');
    const result = decompileClassFile(
      b.build([...indy(call), 0xb0], '()Ljava/util/function/Supplier;'),
    );
    assert.equal(result.status, 'partial');
    assert.ok(result.diagnostics.some((d) => d.code === 'INVALID_BOOTSTRAP'));
  }
});

test('a switch bootstrap used as an ordinary integer result preserves its call site', () => {
  const b = new DynamicClassBuilder();
  const bs = b.bootstrap(
    b.handle('java/lang/runtime/SwitchBootstraps', 'typeSwitch', bootstrapDescriptors.typeSwitch),
    [b.classRef('java/lang/String')],
  );
  const call = b.dynamic(18, bs, 'typeSwitch', '(Ljava/lang/Object;I)I');
  const result = decompileClassFile(b.build([0x01, 0x03, ...indy(call), 0xac], '()I'));
  assert.equal(result.status, 'success');
  assert.match(result.source, /invokeExact\(value, restart\)/);
});

test('unknown dynamic constants inside a concat recipe are not converted into string literals', () => {
  const b = new DynamicClassBuilder();
  const custom = b.bootstrap(b.handle('custom/Factory', 'constant', '()Ljava/lang/Object;'));
  const constant = b.dynamic(17, custom, 'secretValue', 'Ljava/lang/String;');
  const concat = b.bootstrap(
    b.handle(concatOwner, 'makeConcatWithConstants', bootstrapDescriptors.makeConcatWithConstants),
    [b.string('\u0002'), constant],
  );
  const call = b.dynamic(18, concat, 'concat', '()Ljava/lang/String;');
  const result = decompileClassFile(b.build([...indy(call), 0xb0], '()Ljava/lang/String;'));
  assert.equal(result.status, 'partial');
  assert.ok(result.diagnostics.some((d) => d.code === 'UNSUPPORTED_CONSTANT'));
  assert.doesNotMatch(result.source, /return.*secretValue/);
});

test('nonzero switch restart indices are diagnosed instead of silently discarded', () => {
  const b = new DynamicClassBuilder();
  const bs = b.bootstrap(
    b.handle('java/lang/runtime/SwitchBootstraps', 'typeSwitch', bootstrapDescriptors.typeSwitch),
    [b.classRef('java/lang/String')],
  );
  const call = b.dynamic(18, bs, 'typeSwitch', '(Ljava/lang/Object;I)I');
  const code = [
    0x01,
    0x04,
    ...indy(call),
    0xab,
    0,
    0,
    0,
    17,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    17,
    0x03,
    0xac,
  ];
  const result = decompileClassFile(b.build(code, '()I'));
  assert.equal(result.status, 'success');
  assert.match(result.source, /invokeExact\(value, restart\)/);
});

test('null dynamic constants cannot silently become valid concat static arguments', () => {
  const b = new DynamicClassBuilder();
  const nil = b.bootstrap(
    b.handle(constantOwner, 'nullConstant', bootstrapDescriptors.nullConstant),
  );
  const value = b.dynamic(17, nil, 'nil', 'Ljava/lang/String;');
  const concat = b.bootstrap(
    b.handle(concatOwner, 'makeConcatWithConstants', bootstrapDescriptors.makeConcatWithConstants),
    [b.string('\u0002'), value],
  );
  const call = b.dynamic(18, concat, 'concat', '()Ljava/lang/String;');
  const result = decompileClassFile(b.build([...indy(call), 0xb0], '()Ljava/lang/String;'));
  assert.equal(result.status, 'partial');
  assert.ok(result.diagnostics.some((d) => d.code === 'INVALID_BOOTSTRAP'));
});

test('custom record ObjectMethods bodies are not mistaken for generated methods', async () => {
  const { createDecompiler } = await import('../../../src/index.js');
  const b = new DynamicClassBuilder('RecordLike');
  const bs = b.bootstrap(
    b.handle('java/lang/runtime/ObjectMethods', 'bootstrap', bootstrapDescriptors.record),
    [b.classRef(b.name), b.string('x'), b.handle(b.name, 'x', 'I', 1, 9)],
  );
  const call = b.dynamic(18, bs, 'hashCode', `(L${b.name};)I`);
  const decompiler = createDecompiler();
  const cls = decompiler.addClass(b.build([0x2a, ...indy(call), 0x04, 0x60, 0xac], '()I'));
  cls.methods[0].access = 1;
  cls.methods[0].name = 'hashCode';
  cls.recordComponents = [{ name: 'x', descriptor: 'I', annotations: [] }];
  const result = decompiler.decompileAllDetailed();
  assert.equal(result.status, 'partial');
  assert.ok(result.diagnostics.some((d) => d.code === 'UNSUPPORTED_INVOKEDYNAMIC'));
  assert.match(result.sources[0].source, /hashCode\(/);
  assert.match(result.sources[0].source, /decompilation failed/);
});

test('ConstantBootstraps.invoke only recognizes exact supported descriptor factories', () => {
  for (const bad of ['owner', 'signature', 'kind']) {
    const b = new DynamicClassBuilder();
    const factory = b.handle(
      bad === 'owner' ? 'custom/ClassDesc' : 'java/lang/constant/ClassDesc',
      'of',
      bad === 'signature'
        ? '(Ljava/lang/Object;)Ljava/lang/constant/ClassDesc;'
        : '(Ljava/lang/String;)Ljava/lang/constant/ClassDesc;',
      bad === 'kind' ? 5 : 6,
    );
    const bs = b.bootstrap(b.handle(constantOwner, 'invoke', bootstrapDescriptors.invoke), [
      factory,
      b.string('java.lang.String'),
    ]);
    const constant = b.dynamic(17, bs, 'invoke', 'Ljava/lang/constant/ClassDesc;');
    const result = decompileClassFile(
      b.build([...ldc(constant), 0xb0], '()Ljava/lang/constant/ClassDesc;'),
    );
    assert.equal(result.status, 'partial');
    assert.ok(result.diagnostics.some((d) => d.code === 'UNSUPPORTED_CONSTANT'));
  }
});

test('lambda captures and SAM parameters must match the implementation arity', () => {
  const b = new DynamicClassBuilder();
  const bs = b.bootstrap(
    b.handle('java/lang/invoke/LambdaMetafactory', 'metafactory', bootstrapDescriptors.metafactory),
    [
      b.methodType('()Ljava/lang/Object;'),
      b.handle('java/lang/Integer', 'valueOf', '(I)Ljava/lang/Integer;'),
      b.methodType('()Ljava/lang/Integer;'),
    ],
  );
  const call = b.dynamic(18, bs, 'get', '()Ljava/util/function/Supplier;');
  const result = decompileClassFile(
    b.build([...indy(call), 0xb0], '()Ljava/util/function/Supplier;'),
  );
  assert.equal(result.status, 'partial');
  assert.ok(
    result.diagnostics.some(
      (d) => d.code === 'INVALID_BOOTSTRAP' && /parameter counts/.test(d.message),
    ),
  );
});

for (const variant of [
  'missing-count',
  'negative-count',
  'truncated',
  'wrong-marker',
  'unknown-marker',
  'wrong-bridge',
  'extra-bridge',
  'duplicate-bridge',
  'trailing',
]) {
  test(`altMetafactory rejects ${variant} metadata`, () => {
    const b = new DynamicClassBuilder();
    const sam = b.methodType('()Ljava/lang/Object;');
    const impl = b.handle('java/lang/System', 'getProperties', '()Ljava/util/Properties;');
    const inst = b.methodType('()Ljava/util/Properties;');
    const extras: Record<string, number[]> = {
      'missing-count': [b.integer(2)],
      'negative-count': [b.integer(2), b.integer(-1)],
      truncated: [b.integer(2), b.integer(1)],
      'wrong-marker': [b.integer(2), b.integer(1), b.string('java/io/Serializable')],
      'unknown-marker': [b.integer(2), b.integer(1), b.classRef('custom/Marker')],
      'wrong-bridge': [b.integer(4), b.integer(1), b.classRef('java/io/Serializable')],
      'extra-bridge': [b.integer(4), b.integer(1), b.methodType('()Ljava/lang/String;')],
      'duplicate-bridge': [b.integer(4), b.integer(1), sam],
      trailing: [b.integer(0), b.integer(0)],
    };
    const bs = b.bootstrap(
      b.handle(
        'java/lang/invoke/LambdaMetafactory',
        'altMetafactory',
        bootstrapDescriptors.altMetafactory,
      ),
      [sam, impl, inst, ...extras[variant]],
    );
    const call = b.dynamic(18, bs, 'get', '()Ljava/util/function/Supplier;');
    const result = decompileClassFile(
      b.build([...indy(call), 0xb0], '()Ljava/util/function/Supplier;'),
    );
    assert.equal(result.status, 'partial');
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.code ===
          (variant === 'unknown-marker' || variant === 'extra-bridge'
            ? 'UNSUPPORTED_INVOKEDYNAMIC'
            : 'INVALID_BOOTSTRAP'),
      ),
    );
  });
}

for (const variant of [
  'owner',
  'descriptor',
  'kind',
  'reference-tag',
  'missing-class',
  'wrong-class',
  'extra',
]) {
  test(`getStaticFinal rejects ${variant}`, () => {
    const b = new DynamicClassBuilder();
    const handle = b.handle(
      variant === 'owner' ? 'custom/Factory' : constantOwner,
      'getStaticFinal',
      variant === 'descriptor'
        ? bootstrapDescriptors.invoke
        : bootstrapDescriptors.getStaticFinalExplicit,
      variant === 'kind' ? 5 : 6,
      variant === 'reference-tag' ? 11 : 10,
    );
    const args =
      variant === 'missing-class'
        ? []
        : variant === 'wrong-class'
          ? [b.string('java/lang/Integer')]
          : [b.classRef('java/lang/Integer')];
    if (variant === 'extra') args.push(b.integer(1));
    const bs = b.bootstrap(handle, args);
    const value = b.dynamic(17, bs, 'MAX_VALUE', 'I');
    const result = decompileClassFile(b.build([...ldc(value), 0xac], '()I'));
    assert.equal(result.status, 'partial');
    assert.ok(
      result.diagnostics.some((d) =>
        ['INVALID_BOOTSTRAP', 'UNSUPPORTED_CONSTANT'].includes(d.code),
      ),
    );
  });
}

test('captured static implementation arguments are not silently dropped in method references', () => {
  const b = new DynamicClassBuilder();
  const bs = b.bootstrap(
    b.handle('java/lang/invoke/LambdaMetafactory', 'metafactory', bootstrapDescriptors.metafactory),
    [
      b.methodType('()Ljava/lang/Object;'),
      b.handle('java/lang/Integer', 'valueOf', '(I)Ljava/lang/Integer;'),
      b.methodType('()Ljava/lang/Integer;'),
    ],
  );
  const call = b.dynamic(18, bs, 'get', '(I)Ljava/util/function/Supplier;');
  const result = decompileClassFile(
    b.build([0x08, ...indy(call), 0xb0], '()Ljava/util/function/Supplier;'),
  );
  assert.equal(result.status, 'partial');
  assert.ok(result.diagnostics.some((d) => d.code === 'UNSUPPORTED_INVOKEDYNAMIC'));
});
