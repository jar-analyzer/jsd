export type JType =
  | { kind: 'prim'; name: PrimName }
  | { kind: 'class'; name: string; args?: JType[] }
  | { kind: 'array'; elem: JType }
  | { kind: 'typevar'; name: string }
  | { kind: 'wildcard'; bound?: JType; superBound?: JType };

export type PrimName =
  'boolean' | 'byte' | 'char' | 'short' | 'int' | 'long' | 'float' | 'double' | 'void';

export interface MethodSig {
  typeParams: TypeParam[];
  params: JType[];
  ret: JType;
  thrown: JType[];
}
export interface TypeParam {
  name: string;
  classBound: JType | null;
  ifaceBound: JType | null;
}

class SigReader {
  pos = 0;
  constructor(public s: string) {}
  peek(): string {
    return this.s[this.pos] ?? '';
  }
  next(): string {
    return this.s[this.pos++] ?? '';
  }
  expect(c: string): void {
    if (this.next() !== c) throw new Error(`expected '${c}' at ${this.pos - 1} in ${this.s}`);
  }
  try(c: string): boolean {
    if (this.peek() === c) {
      this.pos++;
      return true;
    }
    return false;
  }
  get done(): boolean {
    return this.pos >= this.s.length;
  }
  className(): string {
    const start = this.pos;
    while (this.pos < this.s.length && this.s[this.pos] !== ';') {
      if (this.s[this.pos] === '<') {
        const depthAt = this.skipAngle();
        if (depthAt < 0) break;
      } else this.pos++;
    }
    let name = this.s.slice(start, this.pos);
    if (name.includes('<')) name = name.slice(0, name.indexOf('<'));
    return name;
  }
  private skipAngle(): number {
    let depth = 0;
    while (this.pos < this.s.length) {
      const c = this.s[this.pos];
      if (c === '<') depth++;
      else if (c === '>') {
        depth--;
        if (depth === 0) {
          this.pos++;
          return depth;
        }
      }
      this.pos++;
    }
    return -1;
  }
}

export function parseFieldDescriptor(desc: string): JType {
  const r = new SigReader(desc);
  const t = readType(r);
  if (!r.done) throw new Error(`trailing chars in descriptor ${desc}`);
  return t;
}

export function parseMethodDescriptor(desc: string): { params: JType[]; ret: JType } {
  const r = new SigReader(desc);
  r.expect('(');
  const params: JType[] = [];
  while (r.peek() !== ')') {
    if (r.done) throw new Error(`bad method descriptor ${desc}`);
    params.push(readType(r));
  }
  r.expect(')');
  const ret = readType(r);
  if (!r.done) throw new Error(`trailing chars in descriptor ${desc}`);
  return { params, ret };
}

function P(name: PrimName): JType {
  return { kind: 'prim', name };
}

function readType(r: SigReader): JType {
  const c = r.next();
  switch (c) {
    case 'B':
      return P('byte');
    case 'C':
      return P('char');
    case 'D':
      return P('double');
    case 'F':
      return P('float');
    case 'I':
      return P('int');
    case 'J':
      return P('long');
    case 'S':
      return P('short');
    case 'Z':
      return P('boolean');
    case 'V':
      return P('void');
    case '[':
      return { kind: 'array', elem: readType(r) };
    case 'T': {
      const start = r.pos;
      while (r.peek() !== ';' && !r.done) r.pos++;
      const name = r.s.slice(start, r.pos);
      r.try(';');
      return { kind: 'typevar', name };
    }
    case 'L':
      return readClassType(r);
    default:
      throw new Error(`bad descriptor char '${c}'`);
  }
}

function readClassType(r: SigReader): JType {
  let name = '';
  let args: JType[] | undefined;
  for (;;) {
    const c = r.peek();
    if (c === '' || c === ';') break;
    if (c === '<') {
      r.pos++;
      args = readTypeArgs(r);
      break;
    }
    name += r.next();
  }
  r.try(';');
  let result: JType = { kind: 'class', name, args };
  while (r.peek() === '.') {
    r.pos++;
    let inner = '';
    let innerArgs: JType[] | undefined;
    for (;;) {
      const c = r.peek();
      if (c === '' || c === ';') break;
      if (c === '<') {
        r.pos++;
        innerArgs = readTypeArgs(r);
        break;
      }
      inner += r.next();
    }
    result = {
      kind: 'class',
      name: (result as { name: string }).name + '.' + inner,
      args: innerArgs,
    };
  }
  return result;
}

function readTypeArgs(r: SigReader): JType[] {
  const args: JType[] = [];
  while (r.peek() !== '>') {
    if (r.done) throw new Error('unterminated type args');
    if (r.try('*')) args.push({ kind: 'wildcard' });
    else if (r.try('+')) args.push({ kind: 'wildcard', bound: readType(r) });
    else if (r.try('-')) args.push({ kind: 'wildcard', superBound: readType(r) });
    else args.push(readType(r));
  }
  r.expect('>');
  return args;
}

export function parseSignature(sig: string): MethodSig | JType {
  const r = new SigReader(sig);
  if (r.peek() === '<') {
    const typeParams = readTypeParams(r);
    if (r.peek() === '(') {
      r.expect('(');
      const params: JType[] = [];
      while (r.peek() !== ')') params.push(readType(r));
      r.expect(')');
      const ret = readType(r);
      const thrown: JType[] = [];
      while (r.try('^')) thrown.push(readType(r));
      return { typeParams, params, ret, thrown };
    }
    const t = readType(r);
    void t;
    const ifaces: JType[] = [];
    while (!r.done) ifaces.push(readType(r));
    return {
      typeParams,
      params: [],
      ret: { kind: 'class', name: 'java/lang/Object', args: [] },
      thrown: ifaces,
    } as MethodSig;
  }
  if (r.peek() === '(') {
    r.expect('(');
    const params: JType[] = [];
    while (r.peek() !== ')') params.push(readType(r));
    r.expect(')');
    const ret = readType(r);
    const thrown: JType[] = [];
    while (r.try('^')) thrown.push(readType(r));
    return { typeParams: [], params, ret, thrown };
  }
  return readType(r);
}

function readTypeParams(r: SigReader): TypeParam[] {
  r.expect('<');
  const out: TypeParam[] = [];
  while (r.peek() !== '>') {
    if (r.done) throw new Error('unterminated type params');
    let name = '';
    while (r.peek() !== ':' && r.peek() !== '>' && !r.done) name += r.next();
    let classBound: JType | null = null;
    let ifaceBound: JType | null = null;
    if (r.try(':')) {
      if (r.peek() !== ':') classBound = readType(r);
      if (r.try(':')) ifaceBound = readType(r);
    }
    out.push({ name, classBound, ifaceBound });
  }
  r.expect('>');
  return out;
}

export function internalToDotted(n: string): string {
  return n.replace(/\//g, '.');
}

export function simpleName(n: string): string {
  const dotted = internalToDotted(n);
  const i = dotted.lastIndexOf('.');
  return i === -1 ? dotted : dotted.slice(i + 1);
}
