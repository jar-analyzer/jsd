import type { Expr } from './ast.js';
import { parseMethodDescriptor, type JType } from '../classfile/types.js';

export function expressionType(
  e: Expr,
  localType?: (slot: number) => JType | undefined,
): JType | undefined {
  switch (e.kind) {
    case 'class-literal':
      return { kind: 'class', name: 'java/lang/Class' };
    case 'new-array': {
      let t: JType = e.elemType;
      for (let i = 0; i < e.dims; i++) t = { kind: 'array', elem: t };
      return t;
    }
    case 'array-init':
      return { kind: 'array', elem: e.elemType };
    case 'array-load': {
      const at = expressionType(e.array, localType);
      if (at?.kind === 'array') return at.elem;
      return e.jtype;
    }
    case 'array-length':
      return { kind: 'prim', name: 'int' };
    case 'const':
      switch (e.ctype) {
        case 'char':
          return { kind: 'prim', name: 'char' };
        case 'int':
          return { kind: 'prim', name: 'int' };
        case 'long':
          return { kind: 'prim', name: 'long' };
        case 'float':
          return { kind: 'prim', name: 'float' };
        case 'double':
          return { kind: 'prim', name: 'double' };
        case 'boolean':
          return { kind: 'prim', name: 'boolean' };
        case 'string':
          return { kind: 'class', name: 'java/lang/String' };
        default:
          return undefined;
      }
    case 'cast':
      return e.jtype;
    case 'new':
      return { kind: 'class', name: e.owner };
    case 'invoke': {
      try {
        return parseMethodDescriptor(e.descriptor).ret;
      } catch {
        return undefined;
      }
    }
    case 'field-get':
      return e.jtype;
    case 'local':
      return localType?.(e.slot) ?? e.jtype;
    case 'binary':
      if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(e.op))
        return { kind: 'prim', name: 'boolean' };
      return e.jtype;
    case 'instanceof':
      return { kind: 'prim', name: 'boolean' };
    case 'ternary': {
      const a = expressionType(e.thenE, localType),
        b = expressionType(e.elseE, localType);
      return (
        e.jtype ?? (a?.kind === 'prim' && b?.kind === 'prim' && a.name === b.name ? a : undefined)
      );
    }
    case 'bool':
      return { kind: 'prim', name: 'boolean' };
    case 'concat':
      return { kind: 'class', name: 'java/lang/String' };
    case 'unary': {
      if (e.op === '!') return { kind: 'prim', name: 'boolean' };
      if (['x++', 'x--', '++x', '--x'].includes(e.op))
        return (e.operand as { jtype?: JType }).jtype;
      return e.jtype ?? expressionType(e.operand, localType);
    }
    default:
      return (e as { jtype?: JType }).jtype;
  }
}
