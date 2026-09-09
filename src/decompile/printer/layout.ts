export function indentJava(text: string, levels: number): string {
  const prefix = '    '.repeat(levels);
  return text
    .split('\n')
    .map((line) => (line ? prefix + line : ''))
    .join('\n');
}

export function formatJavaCall(target: string, args: string[]): string {
  const compact = `${target}(${args.join(', ')})`;
  if (!args.length || compact.split('\n')[0].length <= 120) return compact;
  return `${target}(\n${args.map((arg) => indentJava(arg, 2)).join(',\n')}\n)`;
}

export function formatJavaBinary(left: string, op: string, right: string): string {
  const compact = `${left} ${op} ${right}`;
  if (compact.length <= 120 && !compact.includes('\n')) return compact;
  return `${left}\n        ${op} ${right}`;
}
