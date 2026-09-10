import type { Ann } from './model.js';

export type JType = (
  | { kind: 'prim'; name: PrimName }
  | { kind: 'class'; name: string; args?: JType[]; owner?: JType }
  | { kind: 'array'; elem: JType }
  | { kind: 'typevar'; name: string }
  | { kind: 'wildcard'; bound?: JType; superBound?: JType }
) & { annotations?: Ann[] };

export type PrimName =
  'boolean' | 'byte' | 'char' | 'short' | 'int' | 'long' | 'float' | 'double' | 'void';

export interface MethodSig {
  typeParams: TypeParam[];
  params: JType[];
  ret: JType;
  thrown: JType[];
}
export interface TypeParam {
  annotations?: Ann[];
  name: string;
  classBound: JType | null;
  ifaceBounds: JType[];
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
  const t = readDescriptorType(r);
  if (!r.done) throw new Error(`trailing chars in descriptor ${desc}`);
  return t;
}

export function parseMethodDescriptor(desc: string): { params: JType[]; ret: JType } {
  const r = new SigReader(desc);
  r.expect('(');
  const params: JType[] = [];
  while (r.peek() !== ')') {
    if (r.done) throw new Error(`bad method descriptor ${desc}`);
    params.push(readDescriptorType(r));
  }
  r.expect(')');
  const ret = r.try('V') ? P('void') : readDescriptorType(r);
  if (!r.done) throw new Error(`trailing chars in descriptor ${desc}`);
  return { params, ret };
}

function readDescriptorType(r: SigReader, dimensions = 0): JType {
  if (r.try('[')) {
    if (dimensions >= 255) throw new Error('array descriptor exceeds 255 dimensions');
    return { kind: 'array', elem: readDescriptorType(r, dimensions + 1) };
  }
  if (r.try('L')) {
    const start = r.pos;
    while (!r.done && r.peek() !== ';') r.pos++;
    const name = r.s.slice(start, r.pos);
    if (!name || name.split('/').some((part) => !part || /[.;[<>]/.test(part)))
      throw new Error('invalid class descriptor');
    r.expect(';');
    return { kind: 'class', name };
  }
  if (!'BCDFIJSZ'.includes(r.peek()) || r.done) throw new Error('invalid field descriptor');
  return readType(r);
}

export interface ClassSig {
  typeParams: TypeParam[];
  superType: JType;
  interfaces: JType[];
}

export function parseClassSignature(sig: string): ClassSig {
  const r = new SigReader(sig);
  const typeParams = r.peek() === '<' ? readTypeParams(r) : [];
  const superType = readType(r);
  if (superType.kind !== 'class') throw new Error('invalid superclass signature');
  const interfaces: JType[] = [];
  while (!r.done) {
    const type = readType(r);
    if (type.kind !== 'class') throw new Error('invalid interface signature');
    interfaces.push(type);
  }
  return { typeParams, superType, interfaces };
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
  let owner: JType | undefined;
  for (;;) {
    const start = r.pos;
    while (!r.done && ![';', '<', '.'].includes(r.peek())) r.pos++;
    if (r.pos === start) throw new Error('empty class signature name');
    name += r.s.slice(start, r.pos);
    args = r.try('<') ? readTypeArgs(r) : undefined;
    if (!r.try('.')) break;
    owner = { kind: 'class', name, args, ...(owner ? { owner } : {}) };
    name += '$';
  }
  r.expect(';');
  return { kind: 'class', name, args, ...(owner ? { owner } : {}) };
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
    const ifaceBounds: JType[] = [];
    if (r.try(':')) {
      if (r.peek() !== ':') classBound = readType(r);
      while (r.try(':')) ifaceBounds.push(readType(r));
    }
    if (!name) throw new Error('empty type parameter name');
    out.push({ name, classBound, ifaceBounds });
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
