import type { JType } from '../../classfile/types.js';
import type { RenderCtx } from './context.js';
import { resolve } from './context.js';

export function typeStr(t: JType, rc: RenderCtx): string {
  switch (t.kind) {
    case 'prim':
      return t.name;
    case 'typevar':
      return t.name;
    case 'wildcard':
      if (t.bound) return `? extends ${typeStr(t.bound, rc)}`;
      if (t.superBound) return `? super ${typeStr(t.superBound, rc)}`;
      return '?';
    case 'class': {
      const base = resolve(t.name, rc);
      return t.args && t.args.length
        ? `${base}<${t.args.map((a) => typeStr(a, rc)).join(', ')}>`
        : base;
    }
    case 'array':
      return `${typeStr(t.elem, rc)}[]`;
  }
}

export function nestedDisplay(internal: string): string {
  return internal.replace(/\//g, '.').replace(/\$/g, '.');
}

export function simpleOf(display: string): string {
  const i = display.lastIndexOf('.');
  return i === -1 ? display : display.slice(i + 1);
}
