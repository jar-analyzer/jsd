import assert from 'node:assert/strict';
import test from 'node:test';
import { formatJavaSource } from '../../../src/decompile/format/index.js';
import { javaTokens } from '../../../src/decompile/format/tokens.js';
import { javaFormatCases } from '../../support/java-format-cases.js';
import { WorkBudget } from '../../../src/decompile/budget.js';

for (const [name, source] of Object.entries(javaFormatCases)) {
  test(`Java boundary formatting preserves tokens and converges: ${name}`, () => {
    for (const lineWidth of [40, 80, 120]) {
      const result = formatJavaSource(source, { lineWidth });
      assert.notEqual(result, source);
      assert.doesNotMatch(result, /[ \t]+\n/);
      assert.deepEqual(
        javaTokens(result)?.map((t) => t.text),
        javaTokens(source)?.map((t) => t.text),
      );
      assert.equal(formatJavaSource(result, { lineWidth }), result);
    }
  });
}

test('Java type annotations remain attached to generic arguments and array dimensions', () => {
  const result = formatJavaSource(javaFormatCases.annotatedTypes);
  assert.match(result, /<@A\(value = 1\) T extends Object> void m/);
  assert.match(result, /List<@A\(value = 2\) String> list/);
  assert.match(result, /String @A \[\] array/);
});

test('Java enum constant bodies are separated and methods follow a blank line', () => {
  const result = formatJavaSource(javaFormatCases.enumBodies);
  assert.match(result, /\n    FIRST \{/);
  assert.match(result, /\},\n    SECOND \{/);
  assert.match(result, /\};\n\n    public abstract void run\(\);/);
  assert.match(formatJavaSource(javaFormatCases.enumComments), /FIRST, \/\/ first\n    SECOND;/);
});

test('Java line comments force list wrapping without breaking short assignments', () => {
  const result = formatJavaSource(javaFormatCases.resourceComments);
  assert.match(
    result,
    /try \(\n                A a = open\(\); \/\/ first\n                B b = open\(\)\n        \)/,
  );
  assert.match(
    formatJavaSource(javaFormatCases.argumentComments),
    /a, \/\/ trailing\n                b/,
  );
  assert.match(formatJavaSource(javaFormatCases.genericComments), /String \/\/ end\n    >/);
  assert.match(formatJavaSource(javaFormatCases.arrayComments), /2,\n    \}/);
});

test('Java comments between control clauses preserve the complete substatement indentation', () => {
  const result = formatJavaSource(javaFormatCases.commentedTry);
  assert.match(result, /            \} \/\* gap \*\/ catch/);
  assert.match(result, /^        next\(\);$/m);
});

test('Java formatter fallback still enforces output limits and cancellation', () => {
  for (const source of ['class C{', 'class \\u0043 {}', '('.repeat(260) + ')'.repeat(260)]) {
    assert.throws(() => formatJavaSource(source, {}, new WorkBudget({ maxOutputChars: 1 })));
    assert.throws(() =>
      formatJavaSource(source, {}, new WorkBudget({ signal: AbortSignal.abort() })),
    );
    assert.equal(formatJavaSource(source), source);
  }
});

test('Java combined default switch labels remain one label and prefix returns have a space', () => {
  assert.match(formatJavaSource(javaFormatCases.switchPattern), /case null, default -> 0;/);
  assert.match(formatJavaSource(javaFormatCases.prefixReturn), /return \+\+x;/);
  assert.match(formatJavaSource(javaFormatCases.prefixReturn), /return --x;/);
});

test('Java generic declarations are distinguished from comparison arguments and shifts', () => {
  const result = formatJavaSource(javaFormatCases.comparisonArguments);
  assert.match(result, /m\(A<B, C> a, D<E, F> b\)/);
  assert.match(result, /run\(x < y, z > w\);/);
  assert.match(result, /c = x < y >> z;/);
  assert.match(result, /try \(A<B, C> r = open\(\)\)/);
});
