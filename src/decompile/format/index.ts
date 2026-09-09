import { javaTokens } from './tokens.js';
import {
  parse,
  mark,
  statementEnd,
  isBinary,
  space,
  annotationEnd,
  nextCode,
  controls,
  assignments,
  type Node,
} from './syntax.js';
import {
  concat,
  group,
  indent,
  indentOnBreak,
  line,
  softline,
  hardline,
  renderDocument,
  type Doc,
} from './document.js';
import type { WorkBudget } from '../budget.js';

export interface JavaFormatOptions {
  lineWidth?: number;
  indentSize?: number;
  continuationIndent?: number;
}

export function formatJavaSource(
  source: string,
  options: JavaFormatOptions = {},
  budget?: WorkBudget,
): string {
  const width = options.lineWidth ?? 120;
  const tab = options.indentSize ?? 4;
  const continuation = options.continuationIndent ?? 8;
  for (const [name, value] of Object.entries({
    lineWidth: width,
    indentSize: tab,
    continuationIndent: continuation,
  }))
    if (!Number.isSafeInteger(value) || value < 1 || value > 10000)
      throw new RangeError(`${name} must be an integer between 1 and 10000`);
  const check = (work: number, output?: number): void => {
    budget?.check(work);
    if (output !== undefined) budget?.previewOutput(output);
  };
  const finish = (text: string): string => {
    check(0, text.length);
    return text;
  };
  const tokens = javaTokens(source, check);
  if (!tokens) return finish(source);
  const nodes = parse(tokens, check);
  if (!nodes) return finish(source);
  mark(nodes);
  let sequenceDepth = 0;
  const tooDeep = Symbol();
  const sequence = (
    items: Node[],
    context:
      'root' | 'block' | 'class' | 'enum' | 'switch' | 'list' | 'array' | 'type' | 'annotation',
  ): Doc => {
    if (++sequenceDepth > 256) throw tooDeep;
    try {
      const flow = ['list', 'array', 'type', 'annotation'].includes(context);
      const lines: Doc[] = [];
      let pending: Doc[] = [];
      let caseBody = false;
      let caseHeader = false;
      let ternaries = 0;
      let pendingBlank = false;
      let memberStart = true;
      let lastMemberBlock = false;
      const flush = (blank = false): void => {
        if (!pending.length) return;
        const chunk = concat(...pending);
        const content = concat(
          ...(!flow && lines.length
            ? [hardline, ...(blank || pendingBlank ? [hardline] : [])]
            : []),
          group(chunk),
        );
        lines.push(caseBody && !caseHeader ? indent(tab, content) : content);
        pending = [];
        pendingBlank = false;
      };
      for (let i = 0; i < items.length; i++) {
        check(1);
        const node = items[i];
        const previous = items[i - 1];
        const next = items[i + 1];
        const t = node.token.text;
        if (
          ['root', 'block', 'class', 'switch'].includes(context) &&
          /\n\s*\n/.test(node.token.gap) &&
          !pending.length
        )
          pendingBlank = true;
        if (context === 'class' && memberStart) {
          let end = i;
          while (end < items.length && ![';', '{'].includes(items[end].token.text)) end++;
          if (
            lastMemberBlock ||
            (items[end]?.token.text === '{' &&
              !items[end].array &&
              !items.slice(i, end).some((n) => assignments.has(n.token.text)))
          )
            pendingBlank = true;
          memberStart = false;
        }
        if (context === 'switch' && (t === 'case' || (t === 'default' && !caseHeader))) {
          flush();
          caseBody = false;
          caseHeader = true;
        }
        const controlBody =
          ['if', 'for', 'while'].includes(t) && next?.token.text === '('
            ? i + 2
            : ['else', 'do'].includes(t) && next?.token.text !== 'if'
              ? i + 1
              : -1;
        if (
          ['root', 'block', 'switch'].includes(context) &&
          controlBody >= 0 &&
          items[controlBody] &&
          !['{', ';'].includes(items[controlBody].token.text)
        ) {
          const end = statementEnd(items, controlBody);
          const header =
            controlBody === i + 2 ? concat(t, ' (', sequence(next!.children!, 'list'), ')') : t;
          pending.push(
            pending.length ? space(previous, node) : '',
            group(header),
            indent(tab, concat(hardline, sequence(items.slice(controlBody, end), 'block'))),
          );
          i = end - 1;
          const tail = nextCode(items, end);
          if (
            t === 'do' &&
            items[tail]?.token.text === 'while' &&
            items[tail + 1]?.children &&
            items[tail + 2]?.token.text === ';'
          ) {
            pending.push(hardline, sequence(items.slice(end, tail + 3), 'block'));
            i = tail + 2;
          }
          flush();
          continue;
        }
        let prefix: Doc = pending.length ? space(previous, node) : '';
        if (
          previous &&
          (previous.token.kind === 'line-comment' ||
            (previous.token.text === ',' &&
              !(node.token.kind === 'line-comment' && !/[\r\n]/.test(node.token.gap))) ||
            (previous.token.text === ';' &&
              context === 'list' &&
              !(node.token.kind === 'line-comment' && !/[\r\n]/.test(node.token.gap))))
        )
          prefix = '';
        if (
          pending.length &&
          previous &&
          isBinary(previous, items[i - 2]) &&
          !assignments.has(previous.token.text)
        )
          prefix = ' ';
        const chain = t === '.' && !!previous?.close && ['(', '['].includes(previous.token.text);
        const operator =
          (isBinary(node, previous) ||
            ['throws', 'extends', 'implements', 'permits'].includes(t)) &&
          !assignments.has(t) &&
          t !== '->' &&
          !caseHeader;
        if (pending.length && (chain || operator))
          prefix = concat(indent(continuation, chain ? softline : line));
        const ternaryColon = t === ':' && ternaries > 0;
        if (t === '?' && !node.generic) ternaries++;
        if (ternaryColon) ternaries--;
        const label =
          t === ':' &&
          !ternaryColon &&
          (caseHeader || (pending.length === 2 && previous?.token.kind === 'word'));
        if (label) prefix = '';
        let content: Doc = t;
        if (node.generic && t === '<' && context !== 'type') {
          let end = i + 1;
          while (end < items.length && items[end].generic) end++;
          content = group(
            concat(
              '<',
              indentOnBreak(
                continuation,
                concat(softline, sequence(items.slice(i + 1, end - 1), 'type')),
              ),
              /^>+$/.test(items[end - 2]?.token.text ?? '') ? line : softline,
              items[end - 1].token.text,
            ),
            items.slice(i + 1, end - 1).some((n) => n.token.kind === 'line-comment'),
          );
          i = end - 1;
        }
        if (t === '@' && next?.token.text !== 'interface' && context !== 'annotation') {
          const end = annotationEnd(items, i);
          content = sequence(items.slice(i, end), 'annotation');
          i = end - 1;
          pending.push(prefix, content);
          if (['root', 'block', 'class'].includes(context) && pending.length === 2) flush();
          continue;
        }
        if (node.children) {
          const innerContext =
            t === '{'
              ? node.array
                ? 'array'
                : node.enumBody
                  ? 'enum'
                  : node.switchBody
                    ? 'switch'
                    : node.classBody
                      ? 'class'
                      : 'block'
              : 'list';
          const child = sequence(node.children, innerContext);
          if (t === '{' && !node.array) {
            content = node.children.length
              ? concat('{', indent(tab, concat(hardline, child)), hardline, '}')
              : '{}';
          } else if (
            t === '(' &&
            !node.children.some((n) => n.token.kind === 'line-comment') &&
            !(
              ['word', 'number'].includes(previous?.token.kind ?? '') &&
              !controls.has(previous!.token.text) &&
              !['return', 'throw', 'assert', 'yield'].includes(previous!.token.text)
            ) &&
            next?.token.text !== '->'
          ) {
            content = group(
              concat(
                '(',
                previous && controls.has(previous.token.text)
                  ? child
                  : indentOnBreak(continuation, child),
                ')',
              ),
            );
          } else {
            const pad = softline;
            content = group(
              concat(t, indentOnBreak(continuation, concat(pad, child)), pad, node.close!.text),
              node.children.some((n) => n.token.kind === 'line-comment'),
            );
          }
        }
        if (pending.length && assignments.has(previous?.token.text ?? '')) {
          prefix = indent(continuation, line);
        }
        pending.push(prefix, content);
        if (t === '->' && caseHeader) caseHeader = false;
        if (
          t === ',' &&
          context === 'enum' &&
          !(next?.token.kind === 'line-comment' && !/[\r\n]/.test(next.token.gap))
        ) {
          flush();
          continue;
        }
        if (t === ';' && context === 'enum') {
          context = 'class';
          lastMemberBlock = true;
          flush();
          pendingBlank = true;
          continue;
        }
        if (
          next &&
          !(next.token.kind === 'line-comment' && !/[\r\n]/.test(next.token.gap)) &&
          (t === ',' || (t === ';' && context === 'list'))
        ) {
          if (flow) {
            flush();
            lines.push(line);
          } else pending.push(indent(continuation, line));
        }
        if (node.token.kind === 'line-comment') {
          flush();
          if (flow && next) lines.push(hardline);
        } else if (t === ';' && context !== 'list' && context !== 'array') {
          if (
            !next ||
            !['comment', 'line-comment'].includes(next.token.kind) ||
            next.token.gap.includes('\n')
          )
            flush();
          memberStart = true;
          lastMemberBlock = false;
        } else if (label) {
          flush();
          if (caseHeader) {
            caseHeader = false;
            caseBody = true;
          }
        } else if (
          t === '{' &&
          !node.array &&
          context !== 'list' &&
          context !== 'array' &&
          ![';', ',', ')', ']', '.', '::', 'else', 'catch', 'finally', 'while'].includes(
            items[nextCode(items, i + 1)]?.token.text ?? '',
          )
        ) {
          flush();
          memberStart = true;
          lastMemberBlock = true;
        } else if (
          node.token.kind === 'comment' &&
          !flow &&
          (node.token.text.includes('\n') || next?.token.gap.includes('\n'))
        ) {
          flush();
        }
      }
      flush();
      return concat(...lines);
    } finally {
      sequenceDepth--;
    }
  };
  try {
    const rendered = renderDocument(sequence(nodes, 'root'), width, check);
    const result = rendered.endsWith('\n') ? rendered : rendered + '\n';
    const formattedTokens = javaTokens(result, check);
    if (
      !formattedTokens ||
      formattedTokens.length !== tokens.length ||
      formattedTokens.some(
        (token, i) => token.text !== tokens[i].text || token.kind !== tokens[i].kind,
      )
    )
      return finish(source);
    return finish(result);
  } catch (error) {
    if (error === tooDeep) return finish(source);
    throw error;
  }
}
