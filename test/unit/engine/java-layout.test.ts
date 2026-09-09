import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatJavaBinary,
  formatJavaCall,
  indentJava,
} from '../../../src/decompile/printer/layout.js';

test('short calls stay compact and long argument lists use continuation indentation', () => {
  assert.equal(formatJavaCall('print', ['1', '2']), 'print(1, 2)');
  const args = ['"' + 'a'.repeat(70) + '"', '"' + 'b'.repeat(70) + '"'];
  assert.equal(formatJavaCall('print', args), `print(\n        ${args[0]},\n        ${args[1]}\n)`);
});

test('multiline indentation preserves blank lines and literal punctuation', () => {
  const text = '() -> {\n    show("}; { \\\"text\\\"");\n\n}';
  assert.equal(
    indentJava(text, 2),
    '        () -> {\n            show("}; { \\\"text\\\"");\n\n        }',
  );
});

test('long conditions wrap at operators without changing tokens', () => {
  const left = 'checkFirst(' + 'a'.repeat(65) + ')';
  const right = 'checkSecond(' + 'b'.repeat(65) + ')';
  assert.equal(formatJavaBinary(left, '&&', right), `${left}\n        && ${right}`);
});
