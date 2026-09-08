export function escapeString(s: string, quote: '"' | "'" = '"'): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i],
      c = s.charCodeAt(i);
    if (ch === '\\' || ch === quote) {
      out += '\\' + ch;
      continue;
    }
    const escaped: Record<string, string> = {
      '\n': '\\n',
      '\r': '\\r',
      '\t': '\\t',
      '\b': '\\b',
      '\f': '\\f',
    };
    if (escaped[ch]) {
      out += escaped[ch];
      continue;
    }
    if (c < 0x20 || c === 0x7f) out += '\\' + c.toString(8).padStart(3, '0');
    else if (c >= 0xd800 && c <= 0xdfff) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out;
}

export function charLiteral(value: number): string {
  return `'${escapeString(String.fromCharCode(value), "'")}'`;
}

export function javaLiteral(kind: string, value: unknown): string {
  switch (kind) {
    case 'string':
      return `"${escapeString(String(value))}"`;
    case 'char':
      return charLiteral(Number(value));
    case 'boolean':
      return value ? 'true' : 'false';
    case 'null':
      return 'null';
    case 'long':
      return `${value}L`;
    case 'float':
    case 'double': {
      const v = Number(value);
      const owner = kind === 'float' ? 'java.lang.Float' : 'java.lang.Double';
      if (Number.isNaN(v)) return `${owner}.NaN`;
      if (v === Infinity) return `${owner}.POSITIVE_INFINITY`;
      if (v === -Infinity) return `${owner}.NEGATIVE_INFINITY`;
      let s = Object.is(v, -0) ? '-0.0' : String(v);
      if (!/[.eE]/.test(s)) s += '.0';
      return s + (kind === 'float' ? 'f' : '');
    }
    default:
      return String(value);
  }
}
