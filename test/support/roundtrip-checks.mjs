import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function assertGeneratedSources(sources) {
  assert.ok(
    sources.some((s) => s.path.endsWith('.java')),
    'decompiler produced no Java sources',
  );
  for (const s of sources) {
    assert.ok(
      s.status === undefined || s.status === 'success',
      `Incomplete source ${s.path}: ${JSON.stringify(s.diagnostics)}`,
    );
    assert.doesNotMatch(
      s.source,
      /decompilation failed|\/\* invokedynamic:|\/\*\?\*\//i,
      `decompiler emitted a failure placeholder in ${s.path}`,
    );
  }
}

export function checkExpectations(fixturesDir, name, classDir, stdout, parseClass) {
  const path = join(fixturesDir, `${name}.expected.json`);
  if (!existsSync(path)) return;
  const expected = JSON.parse(readFileSync(path, 'utf8'));
  if (expected.stdout !== undefined)
    assert.equal(stdout, expected.stdout, `${name}: expected stdout`);
  for (const [cn, fields] of Object.entries(expected.fieldAnnotations ?? {})) {
    const cf = parseClass(readFileSync(join(classDir, cn + '.class')));
    for (const [fn, annotations] of Object.entries(fields)) {
      const field = cf.fields.find((f) => f.name === fn);
      assert.ok(field, `${cn}.${fn} is missing`);
      assert.deepEqual(
        field.annotations.map((a) => a.typeName).sort(),
        [...annotations].sort(),
        `${cn}.${fn} annotations`,
      );
    }
  }
}

export function findMain(dir, parseClass, allowInstance = false) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.class')) continue;
    const cf = parseClass(readFileSync(join(dir, f)));
    if (cf.enclosing || cf.innerClasses.some((entry) => entry.inner === cf.name)) continue;
    if (
      cf.methods.some(
        (m) =>
          m.name === 'main' &&
          ((m.descriptor === '([Ljava/lang/String;)V' && m.access & 0x0008) ||
            (allowInstance && ['([Ljava/lang/String;)V', '()V'].includes(m.descriptor))),
      )
    ) {
      return cf.name.replace(/\//g, '.');
    }
  }
  return null;
}

export function checkTypeAnnotations(fixturesDir, name, originalDir, recoveredDir, parseClass) {
  const path = join(fixturesDir, `${name}.expected.json`);
  if (!existsSync(path)) return;
  const expected = JSON.parse(readFileSync(path, 'utf8'));
  const annotations = (entries = [], code) =>
    entries
      .map((entry) => ({
        targetType: entry.targetType,
        index: entry.targetType === 0x42 ? code?.exceptions[entry.index]?.catchType : entry.index,
        boundIndex: entry.boundIndex,
        typeArgumentIndex: entry.typeArgumentIndex,
        path: entry.path,
        annotation: entry.annotation,
        visible: entry.visible,
      }))
      .sort((a, b) =>
        JSON.stringify(a, (_, value) =>
          typeof value === 'bigint' ? `${value}n` : value,
        ).localeCompare(
          JSON.stringify(b, (_, value) => (typeof value === 'bigint' ? `${value}n` : value)),
        ),
      );
  const shape = (cls) => ({
    annotations: annotations(cls.typeAnnotations),
    fields: cls.fields.map((field) => [field.name, annotations(field.typeAnnotations)]).sort(),
    methods: cls.methods
      .map((method) => [
        method.name + method.descriptor,
        annotations(method.typeAnnotations),
        annotations(method.code?.typeAnnotations, method.code),
      ])
      .sort(),
    components: cls.recordComponents.map((component) => [
      component.name,
      annotations(component.typeAnnotations),
    ]),
  });
  for (const name of expected.preserveTypeAnnotations ?? []) {
    const original = parseClass(readFileSync(join(originalDir, name + '.class')));
    const recovered = parseClass(readFileSync(join(recoveredDir, name + '.class')));
    assert.deepEqual(
      shape(recovered),
      shape(original),
      `${name}: type annotation metadata changed`,
    );
  }
}
