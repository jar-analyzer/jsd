import { javaLiteral } from '../printer/literals.js';
import { Ann, AnnVal } from '../../classfile/model.js';
import { JType, parseFieldDescriptor } from '../../classfile/types.js';

export function annotationStr(
  ann: Ann,
  gen: { resolve(internal: string): string; renderType(t: JType): string },
): string {
  const name = gen.resolve(ann.typeName);
  if (!ann.pairs.length) return `@${name}`;
  const pairs = ann.pairs.map((p) => `${p.name} = ${annValStr(p.value, gen)}`).join(', ');
  return `@${name}(${pairs})`;
}

export function annValStr(
  v: AnnVal,
  gen: { resolve(internal: string): string; renderType(t: JType): string },
): string {
  switch (v.kind) {
    case 'const': {
      const kind = { s: 'string', Z: 'boolean', J: 'long', F: 'float', D: 'double', C: 'char' }[
        v.tag
      ];
      return javaLiteral(kind ?? 'int', v.value);
    }
    case 'enum':
      return `${gen.resolve(v.typeName)}.${v.constName}`;
    case 'class': {
      let t: JType;
      try {
        t =
          v.className === 'V' ? { kind: 'prim', name: 'void' } : parseFieldDescriptor(v.className);
      } catch {
        t = { kind: 'class', name: 'java/lang/Object' };
      }
      return `${gen.renderType(t)}.class`;
    }
    case 'annotation':
      return annotationStr(v.ann, gen);
    case 'array':
      return `{ ${v.values.map((x) => annValStr(x, gen)).join(', ')} }`;
  }
}
