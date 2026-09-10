import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDecompiler,
  decompileClassFile,
  decompileClassSetDetailed,
  parseClass,
} from '../../../src/index.js';
import { DynamicClassBuilder } from '../../support/dynamic-class-builder.js';
import { classBytes } from '../../support/class-builder.js';

type Location = 'class' | 'field' | 'method' | 'code' | 'record component';

function annotatedClass(
  location: Location,
  visible: boolean,
  count = 1,
  options: {
    target?: number[];
    path?: number[];
    trailing?: number[];
    expression?: 'cast' | 'instanceof' | 'identity-cast';
  } = {},
): Uint8Array {
  const b = new DynamicClassBuilder('Annotated');
  const u2 = (n: number) => [n >>> 8, n & 255];
  const u4 = (n: number) => [n >>> 24, (n >>> 16) & 255, ...u2(n)];
  const self = b.classRef('Annotated');
  const parent = b.classRef('java/lang/Object');
  const string = b.classRef('java/lang/String');
  const fieldName = b.utf8('item');
  const fieldType = b.utf8('Ljava/lang/String;');
  const methodName = b.utf8('value');
  const methodType = b.utf8(
    options.expression === 'instanceof'
      ? '(Ljava/lang/Object;)Z'
      : options.expression
        ? '(Ljava/lang/String;)Ljava/lang/String;'
        : '()Ljava/lang/String;',
  );
  const codeName = b.utf8('Code');
  const recordName = b.utf8('Record');
  const attributeName = b.utf8(
    visible ? 'RuntimeVisibleTypeAnnotations' : 'RuntimeInvisibleTypeAnnotations',
  );
  const annotationType = b.utf8('LMarker;');
  const target =
    location === 'class'
      ? [0x10, 255, 255]
      : location === 'method'
        ? [0x14]
        : location === 'code'
          ? [0x47, 0, 1, 0]
          : [0x13];
  const annotation = [
    ...u2(count),
    ...(count
      ? [...(options.target ?? target), ...(options.path ?? [0]), ...u2(annotationType), 0, 0]
      : []),
    ...(options.trailing ?? []),
  ];
  const attribute = (name: number, data: number[]) => [...u2(name), ...u4(data.length), ...data];
  const annotations = attribute(attributeName, annotation);
  const attrs = (target: Location) => (location === target ? [...u2(1), ...annotations] : u2(0));
  const code =
    options.expression === 'instanceof'
      ? [42, 193, ...u2(string), 172]
      : options.expression === 'identity-cast'
        ? [42, 176]
        : [options.expression ? 42 : 1, 192, ...u2(string), 176];
  const body = [
    0,
    1,
    0,
    options.expression ? 1 : 0,
    ...u4(code.length),
    ...code,
    0,
    0,
    ...attrs('code'),
  ];
  const methods = [
    0,
    1,
    0,
    9,
    ...u2(methodName),
    ...u2(methodType),
    ...u2(location === 'method' ? 2 : 1),
    ...attribute(codeName, body),
    ...(location === 'method' ? annotations : []),
  ];
  const fields = [0, 1, 0, 1, ...u2(fieldName), ...u2(fieldType), ...attrs('field')];
  const classAttrs =
    location === 'record component'
      ? [
          0,
          1,
          ...attribute(recordName, [
            0,
            1,
            ...u2(fieldName),
            ...u2(fieldType),
            ...attrs('record component'),
          ]),
        ]
      : attrs('class');
  return Uint8Array.from([
    202,
    254,
    186,
    190,
    0,
    0,
    0,
    60,
    ...u2(b.entries.length + 1),
    ...b.entries.flat(),
    0,
    33,
    ...u2(self),
    ...u2(parent),
    0,
    0,
    ...fields,
    ...methods,
    ...classAttrs,
  ]);
}

for (const visible of [true, false]) {
  for (const location of ['class', 'field', 'method', 'code', 'record component'] as const) {
    test(`${visible ? 'visible' : 'invisible'} type annotations on ${location} are restored in generated source`, () => {
      const bytes = annotatedClass(location, visible);
      const parsed = parseClass(bytes);
      const annotations = [
        ...(parsed.typeAnnotations ?? []),
        ...parsed.fields.flatMap((field) => field.typeAnnotations ?? []),
        ...parsed.methods.flatMap((method) => [
          ...(method.typeAnnotations ?? []),
          ...(method.code?.typeAnnotations ?? []),
        ]),
        ...parsed.recordComponents.flatMap((component) => component.typeAnnotations ?? []),
      ];
      assert.equal(annotations.length, 1);
      assert.equal(annotations[0].visible, visible);
      assert.equal(annotations[0].annotation.typeName, 'Marker');
      const single = decompileClassFile(bytes);
      assert.equal(single.status, 'success');
      assert.deepEqual(single.diagnostics, []);
      assert.match(single.source, /@Marker/);
      const batch = decompileClassSetDetailed(new Map([['Annotated.class', bytes]]));
      assert.equal(batch.status, 'success');
      assert.equal(batch.sources[0].status, 'success');
      assert.deepEqual(batch.diagnostics, single.diagnostics);
    });
  }
}

test('empty type annotation attributes do not degrade source status', () => {
  const result = decompileClassFile(annotatedClass('field', true, 0));
  assert.equal(result.status, 'success');
  assert.deepEqual(result.diagnostics, []);
});

test('nested class type annotations are emitted inside the enclosing source', () => {
  const d = createDecompiler();
  d.addClass(classBytes('Outer', []));
  const cls = d.addClass(annotatedClass('field', true));
  cls.innerClasses.push({ inner: cls.name, outer: 'Outer', innerName: 'Member', access: 9 });
  const report = d.decompileAllDetailed();
  assert.equal(report.sources.length, 1);
  assert.equal(report.sources[0].status, 'success');
  assert.equal(report.status, 'success');
  assert.deepEqual(report.diagnostics, []);
  assert.match(report.sources[0].source, /@Marker/);
  assert.deepEqual(d.decompileAllDetailed(), report);
});

test('malformed type annotation targets, paths and trailing bytes are rejected', () => {
  for (const options of [
    { target: [0x14] },
    { target: [0xff] },
    { path: [1, 4, 0] },
    { path: [1, 0, 1] },
    { trailing: [0] },
  ]) {
    assert.throws(() => parseClass(annotatedClass('field', true, 1, options)), /type annotation/i);
  }
});

test('type annotation target payloads retain indices, offsets and local ranges', () => {
  const targets: [Location, number[], Record<string, unknown>][] = [
    ['class', [0, 2], { index: 2 }],
    ['class', [0x11, 2, 1], { index: 2, boundIndex: 1 }],
    ['method', [0x16, 2], { index: 2 }],
    ['method', [0x17, 0, 2], { index: 2 }],
    ['code', [0x40, 0, 1, 0, 1, 0, 3, 0, 2], { table: [{ start: 1, length: 3, index: 2 }] }],
    ['code', [0x42, 0, 2], { index: 2 }],
    ['code', [0x43, 0, 1], { offset: 1 }],
    ['code', [0x4b, 0, 1, 2], { offset: 1, typeArgumentIndex: 2 }],
  ];
  for (const [location, target, expected] of targets) {
    const cls = parseClass(annotatedClass(location, true, 1, { target, path: [1, 3, 0] }));
    const entry = (
      location === 'class'
        ? cls.typeAnnotations
        : location === 'method'
          ? cls.methods[0].typeAnnotations
          : cls.methods[0].code?.typeAnnotations
    )![0];
    for (const [key, value] of Object.entries(expected))
      assert.deepEqual(entry[key as keyof typeof entry], value);
    assert.deepEqual(entry.path, [{ kind: 3, index: 0 }]);
  }
});

test('code type annotations accept instruction and expression-start offsets', () => {
  for (const visible of [true, false]) {
    for (const expression of ['cast', 'instanceof', 'identity-cast'] as const) {
      for (const offset of [0, 1]) {
        const target = expression === 'instanceof' ? [0x43, 0, offset] : [0x47, 0, offset, 0];
        const result = decompileClassFile(
          annotatedClass('code', visible, 1, { expression, target }),
        );
        assert.equal(
          result.status,
          'success',
          JSON.stringify({ expression, offset, diagnostics: result.diagnostics }),
        );
        assert.match(
          result.source,
          expression === 'instanceof' ? /instanceof @Marker String/ : /\(@Marker String\)/,
        );
      }
    }
  }
});
