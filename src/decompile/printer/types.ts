import type { JType } from '../../classfile/types.js';
import type { RenderCtx } from './context.js';
import { annotationStr } from '../classgen/annotations.js';
import type { Ann } from '../../classfile/model.js';
import { resolve } from './context.js';

export function typeAnnotationText(annotations: Ann[] | undefined, rc: RenderCtx): string {
  return (annotations ?? [])
    .map((ann) =>
      annotationStr(ann, {
        resolve: (name) => resolve(name, rc),
        renderType: (type) => typeStr(type, rc),
      }),
    )
    .join(' ');
}

export function typeStr(t: JType, rc: RenderCtx, dimensions?: string[]): string {
  const annotations = typeAnnotationText(t.annotations, rc);
  const prefix = annotations ? annotations + ' ' : '';
  switch (t.kind) {
    case 'prim':
    case 'typevar':
      return prefix + t.name;
    case 'wildcard':
      if (t.bound) return `${prefix}? extends ${typeStr(t.bound, rc)}`;
      if (t.superBound) return `${prefix}? super ${typeStr(t.superBound, rc)}`;
      return prefix + '?';
    case 'class': {
      let base: string;
      if (t.owner?.kind === 'class') {
        const name = rc.ctx.innerClass(t.name)?.innerName ?? t.name.slice(t.owner.name.length + 1);
        base = `${typeStr(t.owner, rc)}.${prefix}${name}`;
      } else {
        base = resolve(t.name, rc);
        const dot = base.lastIndexOf('.');
        if (annotations) base = base.slice(0, dot + 1) + prefix + base.slice(dot + 1);
      }
      return t.args?.length ? `${base}<${t.args.map((arg) => typeStr(arg, rc)).join(', ')}>` : base;
    }
    case 'array': {
      const levels: JType[] = [];
      let element = t as JType;
      while (element.kind === 'array') {
        levels.push(element);
        element = element.elem;
      }
      return (
        typeStr(element, rc) +
        levels
          .map((level, i) => {
            const ann = typeAnnotationText(level.annotations, rc);
            return `${ann ? ' ' + ann + ' ' : ''}${dimensions?.[i] ?? '[]'}`;
          })
          .join('')
      );
    }
  }
}

export function nestedDisplay(internal: string): string {
  return internal.replace(/\//g, '.').replace(/\$/g, '.');
}

export function simpleOf(display: string): string {
  const i = display.lastIndexOf('.');
  return i === -1 ? display : display.slice(i + 1);
}
