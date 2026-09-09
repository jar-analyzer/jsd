import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Node } from 'web-tree-sitter';
import { formatJavaSource } from '../../../src/decompile/format/index.js';
import { javaTokens } from '../../../src/decompile/format/tokens.js';
import { javaFormatCases } from '../../support/java-format-cases.js';

function shape(node: Node): unknown {
  return node.childCount
    ? [
        node.type,
        ...node.children
          .filter((n) => !['line_comment', 'block_comment'].includes(n.type))
          .map(shape),
      ]
    : [node.type, node.text];
}

test('Independent Java parser verifies fixture trees and seeded whitespace mutations', async () => {
  const { Parser, Language } = await import(
    pathToFileURL(resolve('node_modules/web-tree-sitter/web-tree-sitter.js')).href
  );
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(
    await Language.load(
      resolve('node_modules/prettier-plugin-java/dist/tree-sitter-java_orchard.wasm'),
    ),
  );
  const treeOf = (source: string, label: string): string => {
    const tree = parser.parse(source);
    try {
      assert.equal(tree.rootNode.hasError, false, `${label}\n${source}`);
      return JSON.stringify(shape(tree.rootNode));
    } finally {
      tree.delete();
    }
  };
  try {
    const fixtures = readdirSync('test/roundtrip/fixtures', { recursive: true }).filter(
      (p): p is string => typeof p === 'string' && p.endsWith('.java'),
    );
    for (const fixture of fixtures) {
      const source = readFileSync(`test/roundtrip/fixtures/${fixture}`, 'utf8');
      const expected = treeOf(source, fixture);
      for (const lineWidth of [40, 120])
        assert.equal(treeOf(formatJavaSource(source, { lineWidth }), fixture), expected, fixture);
    }
    let seed = 20260909;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    const cases = Object.entries(javaFormatCases);
    const expected = cases.map(([name, source]) => treeOf(source, name));
    for (let round = 0; round < 1000; round++) {
      const index = round % cases.length;
      const [name, source] = cases[index];
      const tokens = javaTokens(source)!;
      const variant = tokens
        .map(
          (token, i) =>
            (tokens[i - 1]?.kind === 'line-comment'
              ? '\n'
              : [' ', '\n', '\t', ' \n ', '\r\n'][random() % 5]) + token.text,
        )
        .join('');
      const options = {
        lineWidth: [40, 60, 80, 120][random() % 4],
        indentSize: [2, 4][random() % 2],
        continuationIndent: [4, 8][random() % 2],
      };
      const result = formatJavaSource(variant, options);
      const label = `${name}, round ${round}, seed ${seed}`;
      assert.equal(treeOf(variant, label), expected[index], label);
      assert.equal(treeOf(result, label), expected[index], label);
      assert.notEqual(result, variant, label);
      assert.equal(formatJavaSource(result, options), result, label);
      assert.deepEqual(
        javaTokens(result)?.map((t) => t.text),
        tokens.map((t) => t.text),
        label,
      );
    }
  } finally {
    parser.delete();
  }
});
