export interface JavaToken {
  text: string;
  kind: 'word' | 'number' | 'literal' | 'comment' | 'line-comment' | 'symbol';
  gap: string;
}

const operators = [
  '>>>=',
  '>>>',
  '<<=',
  '>>=',
  '...',
  '::',
  '->',
  '++',
  '--',
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<',
  '>>',
];
const numeric =
  /(?:0[xX](?:[\da-fA-F_]+(?:\.[\da-fA-F_]*)?|\.[\da-fA-F_]+)[pP][+-]?[\d_]+[fFdD]?|0[xX][\da-fA-F_]+[lL]?|0[bB][01_]+[lL]?|(?:[\d_]+(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?[\d_]+)?[fFdDlL]?)/y;
const word = /[\w$\u0080-\uffff]/;

export function javaTokens(
  source: string,
  check: (work: number) => void = () => {},
): JavaToken[] | null {
  const tokens: JavaToken[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    check(1);
    const gapStart = cursor;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
    check(cursor - gapStart);
    const gap = source.slice(gapStart, cursor);
    if (cursor === source.length) break;
    const start = cursor;
    let kind: JavaToken['kind'] = 'symbol';
    if (source.startsWith('//', cursor)) {
      kind = 'line-comment';
      cursor += 2;
      while (cursor < source.length && !['\r', '\n'].includes(source[cursor])) cursor++;
    } else if (source.startsWith('/*', cursor)) {
      kind = 'comment';
      const end = source.indexOf('*/', cursor + 2);
      if (end < 0) return null;
      cursor = end + 2;
    } else if (source[cursor] === '"' || source[cursor] === "'") {
      kind = 'literal';
      const delimiter = source.startsWith('"""', cursor) ? '"""' : source[cursor];
      cursor += delimiter.length;
      let closed = false;
      while (cursor < source.length) {
        if (source[cursor] === '\\') cursor += 2;
        else if (source.startsWith(delimiter, cursor)) {
          cursor += delimiter.length;
          closed = true;
          break;
        } else cursor++;
      }
      if (!closed) return null;
    } else if (
      /\d/.test(source[cursor]) ||
      (source[cursor] === '.' && /\d/.test(source[cursor + 1] ?? ''))
    ) {
      kind = 'number';
      numeric.lastIndex = cursor;
      cursor += numeric.exec(source)?.[0].length ?? 1;
    } else if (word.test(source[cursor])) {
      kind = 'word';
      cursor++;
      while (cursor < source.length && word.test(source[cursor])) cursor++;
      if (
        source.slice(start, cursor) === 'non' &&
        source.startsWith('-sealed', cursor) &&
        !word.test(source[cursor + 7] ?? '')
      )
        cursor += 7;
    } else {
      if (source[cursor] === '\\') return null;
      cursor += operators.find((op) => source.startsWith(op, cursor))?.length ?? 1;
    }
    tokens.push({ text: source.slice(start, cursor), kind, gap });
    check(cursor - start);
  }
  return tokens;
}
