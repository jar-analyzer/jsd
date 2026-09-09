export type Doc =
  | string
  | { kind: 'concat'; parts: Doc[] }
  | { kind: 'line'; flat: string; hard: boolean }
  | { kind: 'indent'; amount: number; doc: Doc; conditional?: boolean }
  | { kind: 'group'; doc: Doc; forceBreak: boolean };
export const line: Doc = { kind: 'line', flat: ' ', hard: false };
export const softline: Doc = { kind: 'line', flat: '', hard: false };
export const hardline: Doc = { kind: 'line', flat: '', hard: true };
export const concat = (...parts: Doc[]): Doc => ({ kind: 'concat', parts });
export const indent = (amount: number, doc: Doc): Doc => ({ kind: 'indent', amount, doc });
export const indentOnBreak = (amount: number, doc: Doc): Doc => ({
  kind: 'indent',
  amount,
  doc,
  conditional: true,
});
export const group = (doc: Doc, forceBreak = false): Doc => ({ kind: 'group', doc, forceBreak });

interface Frame {
  doc: Doc;
  indent: number;
  flat: boolean;
}

export function renderDocument(
  doc: Doc,
  width: number,
  check: (work: number, output?: number) => void = () => {},
): string {
  const output: string[] = [];
  let size = 0;
  let column = 0;
  let pendingIndent: number | undefined;
  const stack: Frame[] = [{ doc, indent: 0, flat: false }];
  const push = (text: string): void => {
    size += text.length;
    check(text.length, size);
    output.push(text);
  };
  const fits = (candidate: Frame): boolean => {
    let remaining = width - (pendingIndent ?? column);
    const pending: Frame[] = [candidate];
    let suffix = stack.length - 1;
    while ((pending.length || suffix >= 0) && remaining >= 0) {
      check(1);
      const f = pending.pop() ?? stack[suffix--];
      const d = f.doc;
      if (typeof d === 'string') {
        const newline = d.indexOf('\n');
        if (newline >= 0) return newline <= remaining;
        remaining -= d.length;
      } else if (d.kind === 'line') {
        if (d.hard || !f.flat) return true;
        remaining -= d.flat.length;
      } else if (d.kind === 'concat') {
        for (let i = d.parts.length - 1; i >= 0; i--) pending.push({ ...f, doc: d.parts[i] });
      } else {
        if (d.kind === 'group' && d.forceBreak) return false;
        pending.push({ ...f, doc: d.doc, flat: d.kind === 'group' ? true : f.flat });
      }
    }
    return remaining >= 0;
  };
  while (stack.length) {
    check(1);
    const f = stack.pop()!;
    const d = f.doc;
    if (typeof d === 'string') {
      if (!d) continue;
      if (pendingIndent !== undefined) {
        push(' '.repeat(pendingIndent));
        column = pendingIndent;
        pendingIndent = undefined;
      }
      push(d);
      const newline = d.lastIndexOf('\n');
      column = newline >= 0 ? d.length - newline - 1 : column + d.length;
    } else if (d.kind === 'line') {
      if (f.flat && !d.hard) {
        if (d.flat) {
          push(d.flat);
          column += d.flat.length;
        }
      } else {
        push('\n');
        column = 0;
        pendingIndent = f.indent;
      }
    } else if (d.kind === 'concat') {
      for (let i = d.parts.length - 1; i >= 0; i--) stack.push({ ...f, doc: d.parts[i] });
    } else if (d.kind === 'indent')
      stack.push({ ...f, indent: f.indent + (d.conditional && f.flat ? 0 : d.amount), doc: d.doc });
    else
      stack.push({
        ...f,
        doc: d.doc,
        flat: !d.forceBreak && fits({ ...f, doc: d.doc, flat: true }),
      });
  }
  return output.join('');
}
