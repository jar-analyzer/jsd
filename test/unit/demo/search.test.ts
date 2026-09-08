import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, matchFiles } from '../../../docs/search-model.js';

test('source search treats regular expression punctuation as literal text', () => {
  assert.deepEqual(findMatches('a.b aXb a.b', 'a.b').matches, [
    { start: 0, end: 3 },
    { start: 8, end: 11 },
  ]);
  assert.equal(findMatches('a[] $x', 'a[]').matches.length, 1);
  assert.equal(findMatches('anything', '').matches.length, 0);
});

test('case-insensitive matching preserves offsets in the original source', () => {
  assert.deepEqual(findMatches('İ String string', 'string').matches, [
    { start: 2, end: 8 },
    { start: 9, end: 15 },
  ]);
  assert.deepEqual(findMatches('String string', 'String', { matchCase: true }).matches, [
    { start: 0, end: 6 },
  ]);
});

test('whole-word search respects Java identifiers and Unicode boundaries', () => {
  const source = 'name names _name $name 名name name𐐀 (name)';
  const result = findMatches(source, 'name', { wholeWord: true });
  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map(({ start, end }) => source.slice(start, end)),
    ['name', 'name'],
  );
  assert.equal(findMatches('name', 'name', { wholeWord: true }).matches.length, 1);
});

test('source search caps highlights and distinguishes an exact limit from truncation', () => {
  assert.equal(findMatches('x x x', 'x', {}, 3).limited, false);
  const result = findMatches('x x x x', 'x', {}, 3);
  assert.equal(result.limited, true);
  assert.equal(result.matches.length, 3);
  assert.deepEqual(findMatches('a\nb\na\nb', 'a\nb').matches, [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
  ]);
});

test('quick open ranks filenames ahead of path and fuzzy matches', () => {
  const paths = ['demo/Other.class', 'pkg/MyDemo.class', 'pkg/Demo.class', 'pkg/DeepModel.class'];
  const result = matchFiles(paths, 'demo');
  assert.deepEqual(
    result.items.map((item) => item.path),
    ['pkg/Demo.class', 'pkg/MyDemo.class', 'demo/Other.class', 'pkg/DeepModel.class'],
  );
  assert.equal(matchFiles(paths, 'missing').total, 0);
});

test('quick open reports all matches while limiting the rendered result list', () => {
  const result = matchFiles(['a/A.class', 'b/B.class', 'c/C.class'], '', 2);
  assert.equal(result.total, 3);
  assert.equal(result.items.length, 2);
});
