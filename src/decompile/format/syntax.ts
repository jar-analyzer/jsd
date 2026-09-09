import type { JavaToken } from './tokens.js';

export type Node = {
  token: JavaToken;
  close?: JavaToken;
  children?: Node[];
  array?: boolean;
  switchBody?: boolean;
  classBody?: boolean;
  enumBody?: boolean;
  generic?: boolean;
  unary?: boolean;
  annotationEnd?: boolean;
};
export const controls = new Set(['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'try']);
const binary = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<=',
  '>>=',
  '>>>=',
  '||',
  '&&',
  '|',
  '^',
  '&',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  '<<',
  '>>',
  '>>>',
  '+',
  '-',
  '*',
  '/',
  '%',
  'instanceof',
  '?',
  ':',
  '->',
]);
export const assignments = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<=',
  '>>=',
  '>>>=',
]);
const closing = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);

export function parse(tokens: JavaToken[], check: (work: number) => void): Node[] | null {
  const root: Node[] = [];
  const stack: { nodes: Node[]; owner?: Node }[] = [{ nodes: root }];
  for (const token of tokens) {
    check(1);
    const current = stack[stack.length - 1];
    if ([')', ']', '}'].includes(token.text)) {
      if (!current.owner || closing.get(current.owner.token.text) !== token.text) return null;
      current.owner.close = token;
      stack.pop();
      continue;
    }
    const node: Node = { token };
    current.nodes.push(node);
    if (closing.has(token.text)) {
      if (stack.length > 256) return null;
      node.children = [];
      stack.push({ nodes: node.children, owner: node });
    }
  }
  return stack.length === 1 ? root : null;
}

function genericStart(nodes: Node[], index: number, declarations: boolean): boolean {
  const prev = nodes[index - 1];
  if (prev && prev.token.kind !== 'word' && !['.', '::', ';', '}', ')'].includes(last(prev)))
    return false;
  let depth = 0;
  for (let i = index; i < nodes.length; i++) {
    const t = nodes[i].token.text;
    if (t === '@') {
      const end = annotationEnd(nodes, i);
      if (end === i + 1) return false;
      i = end - 1;
    } else if (nodes[i].token.kind === 'comment' || nodes[i].token.kind === 'line-comment')
      continue;
    else if (t === '<') depth++;
    else if (/^>{1,3}$/.test(t)) {
      depth -= t.length;
      if (depth < 0) return false;
      if (depth === 0)
        return (
          declarations ||
          nodes[i + 1]?.token.kind !== 'word' ||
          ['.', '::', 'new'].includes(prev?.token.text ?? '') ||
          nodes.slice(0, index).some((n) => n.token.text === 'instanceof')
        );
    } else if (nodes[i].token.kind !== 'word' && !['?', ',', '.', '&', '[', '@'].includes(t))
      return false;
  }
  return false;
}

export function mark(
  nodes: Node[],
  parentArray = false,
  parentDelimiter = '',
  parentEnum = false,
  declarations = true,
  parentClass = false,
): void {
  let angles = 0;
  let declarationStart = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const t = node.token.text;
    const prev = nodes[i - 1];
    if (t === '<' && (angles > 0 || genericStart(nodes, i, declarations))) {
      angles++;
      node.generic = true;
    } else if (angles > 0) {
      node.generic = true;
      if (/^>{1,3}$/.test(t)) angles = Math.max(0, angles - t.length);
    }
    if (t === '{') {
      node.array =
        parentArray ||
        prev?.token.text === '=' ||
        prev?.token.text === 'default' ||
        prev?.token.text === '[' ||
        (!prev && parentDelimiter === '(');
      node.switchBody = prev?.token.text === '(' && nodes[i - 2]?.token.text === 'switch';
      node.enumBody = nodes
        .slice(declarationStart, i)
        .some((n, j, list) => n.token.text === 'enum' && list[j + 1]?.token.kind === 'word');
      node.classBody =
        parentEnum ||
        (!node.array &&
          prev?.token.text === '(' &&
          nodes.slice(declarationStart, i).some((n) => n.token.text === 'new')) ||
        nodes
          .slice(declarationStart, i)
          .some(
            (n, j, list) =>
              ['class', 'interface', 'enum', 'record'].includes(n.token.text) &&
              list[j - 1]?.token.text !== '.' &&
              list[j + 1]?.token.kind === 'word',
          );
    }
    if (t === '@' && nodes[i + 1]?.token.text !== 'interface')
      nodes[annotationEnd(nodes, i) - 1].annotationEnd = true;
    if (['+', '-'].includes(t)) {
      node.unary =
        !prev ||
        (!prev.generic && binary.has(last(prev))) ||
        [',', ';', '!', '~', 'return', 'throw', 'yield', 'case', 'assert'].includes(last(prev)) ||
        (prev.token.text === '(' &&
          prev.children?.length === 1 &&
          ['byte', 'short', 'int', 'long', 'float', 'double', 'char'].includes(
            prev.children[0].token.text,
          ));
    }
    if (node.children) {
      const childDeclarations =
        t !== '(' ||
        ['for', 'catch', 'try'].includes(prev?.token.text ?? '') ||
        nodes[i + 1]?.token.text === '->' ||
        nodes[i - 2]?.token.text === 'record' ||
        (parentClass &&
          i - declarationStart >= 2 &&
          !nodes
            .slice(declarationStart, i)
            .some((n) => assignments.has(n.token.text) || n.token.text === 'new'));
      mark(
        node.children,
        !!node.array,
        t,
        !!node.enumBody,
        childDeclarations,
        !!node.classBody || !!node.enumBody,
      );
    }
    if (t === ';') parentEnum = false;
    if (t === ';' || t === '{') declarationStart = i + 1;
  }
}

export function annotationEnd(nodes: Node[], start: number): number {
  if (nodes[start + 1]?.token.kind !== 'word') return start + 1;
  let end = start + 2;
  while (nodes[end]?.token.text === '.' && nodes[end + 1]?.token.kind === 'word') end += 2;
  if (nodes[end]?.token.text === '(') end++;
  return end;
}

export function nextCode(nodes: Node[], start: number): number {
  while (nodes[start]?.token.kind === 'comment' || nodes[start]?.token.kind === 'line-comment')
    start++;
  return start;
}

export function statementEnd(nodes: Node[], start: number, depth = 0): number {
  if (depth > 128) return nodes.length;
  start = nextCode(nodes, start);
  const t = nodes[start]?.token.text;
  if (t === '{') return start + 1;
  if (
    ['if', 'for', 'while', 'switch', 'synchronized'].includes(t) &&
    nodes[start + 1]?.token.text === '('
  ) {
    let end = statementEnd(nodes, start + 2, depth + 1);
    const tail = nextCode(nodes, end);
    if (t === 'if' && nodes[tail]?.token.text === 'else')
      end = statementEnd(nodes, tail + 1, depth + 1);
    return end;
  }
  if (nodes[start]?.token.kind === 'word' && nodes[start + 1]?.token.text === ':')
    return statementEnd(nodes, start + 2, depth + 1);
  if (t === 'try') {
    const body = nextCode(nodes, start + 1);
    let end = statementEnd(nodes, nodes[body]?.token.text === '(' ? body + 1 : body, depth + 1);
    for (;;) {
      const tail = nextCode(nodes, end);
      if (nodes[tail]?.token.text === 'catch')
        end = statementEnd(nodes, nextCode(nodes, tail + 1) + 1, depth + 1);
      else if (nodes[tail]?.token.text === 'finally')
        return statementEnd(nodes, tail + 1, depth + 1);
      else return end;
    }
  }
  if (t === 'do') {
    const end = statementEnd(nodes, start + 1, depth + 1);
    const tail = nextCode(nodes, end);
    return nodes[tail]?.token.text === 'while' ? Math.min(nodes.length, tail + 3) : end;
  }
  for (let i = start; i < nodes.length; i++) if (nodes[i].token.text === ';') return i + 1;
  return nodes.length;
}

function last(node: Node): string {
  return node.close?.text ?? node.token.text;
}
export function isBinary(node: Node, prev?: Node): boolean {
  if (node.generic || node.unary || !binary.has(node.token.text)) return false;
  if (node.unary === false) return true;
  if (['+', '-', '*', '&'].includes(node.token.text)) {
    if (
      !prev ||
      binary.has(last(prev)) ||
      ['(', '[', ',', 'return', 'throw', 'case'].includes(last(prev))
    )
      return false;
    if (node.token.text === '*' && last(prev) === '.') return false;
  }
  return true;
}

export function space(prev: Node | undefined, next: Node): string {
  if (!prev) return '';
  const a = last(prev),
    b = next.token.text;
  if (
    next.token.kind === 'comment' ||
    next.token.kind === 'line-comment' ||
    prev.token.kind === 'comment'
  )
    return ' ';
  if (['.', '::', ',', ';', ']', ')'].includes(b) || ['.', '::', '@'].includes(a)) return '';
  if (next.generic && ['<', '>', '>>', '>>>'].includes(b))
    return /^>+$/.test(a) && /^>+$/.test(b) ? ' ' : '';
  if (prev.generic && (a === '<' || a === '?')) return a === '?' ? ' ' : '';
  if (b === '(') return controls.has(a) || !!prev.close ? ' ' : '';
  if (b === '[' || b === '...') return prev.annotationEnd ? ' ' : '';
  if (a === '...') return ' ';
  if (b === '{' || a === '}' || a === ',') return ' ';
  if (prev.unary)
    return a === b || (a === '+' && b === '++') || (a === '-' && b === '--') ? ' ' : '';
  if (['++', '--'].includes(b) && ['return', 'throw', 'yield', 'case', 'assert'].includes(a))
    return ' ';
  if (['!', '~', '++', '--'].includes(a) || ['++', '--'].includes(b)) return '';
  if (isBinary(next, prev) || isBinary(prev)) return ' ';
  if (
    prev.token.kind === 'word' ||
    prev.token.kind === 'number' ||
    prev.token.kind === 'literal' ||
    prev.close
  )
    return ' ';
  return next.token.gap ? ' ' : '';
}
