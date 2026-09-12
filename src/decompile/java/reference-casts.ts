import type { JType } from '../../classfile/types.js';
import type { Ctx } from '../context.js';

interface Hierarchy {
  final: boolean;
  interface: boolean;
  parents: string[];
}

function hierarchy(name: string, ctx: Ctx): Hierarchy | undefined {
  const cls = ctx.lookup(name);
  if (cls)
    return {
      final: !!(cls.access & 0x10),
      interface: !!(cls.access & 0x200),
      parents: [...(cls.superName ? [cls.superName] : []), ...cls.interfaces],
    };
  if (name === 'java/lang/Object') return { final: false, interface: false, parents: [] };
  if (name === 'java/lang/String')
    return {
      final: true,
      interface: false,
      parents: [
        'java/lang/Object',
        'java/io/Serializable',
        'java/lang/Comparable',
        'java/lang/CharSequence',
        'java/lang/constant/Constable',
        'java/lang/constant/ConstantDesc',
      ],
    };
  if (name === 'java/lang/Number')
    return {
      final: false,
      interface: false,
      parents: ['java/lang/Object', 'java/io/Serializable'],
    };
  if (
    ['Byte', 'Short', 'Integer', 'Long', 'Float', 'Double', 'Boolean', 'Character'].some(
      (type) => name === 'java/lang/' + type,
    )
  )
    return {
      final: true,
      interface: false,
      parents: [
        ['java/lang/Boolean', 'java/lang/Character'].includes(name)
          ? 'java/lang/Object'
          : 'java/lang/Number',
        'java/io/Serializable',
        'java/lang/Comparable',
        'java/lang/constant/Constable',
        ...(['java/lang/Integer', 'java/lang/Long', 'java/lang/Float', 'java/lang/Double'].includes(
          name,
        )
          ? ['java/lang/constant/ConstantDesc']
          : []),
      ],
    };
  return undefined;
}

function subtype(from: string, to: string, ctx: Ctx, seen = new Set<string>()): boolean {
  if (from === to || to === 'java/lang/Object') return true;
  if (seen.has(from)) return false;
  seen.add(from);
  ctx.budget.check(1);
  return hierarchy(from, ctx)?.parents.some((parent) => subtype(parent, to, ctx, seen)) ?? false;
}

export function needsReferenceCastBridge(from: JType | undefined, to: JType, ctx: Ctx): boolean {
  if (!from || from.kind === 'prim' || to.kind === 'prim') return false;
  if (from.kind === 'array' && to.kind === 'array') {
    if (from.elem.kind === 'prim' || to.elem.kind === 'prim')
      return (
        from.elem.kind !== to.elem.kind ||
        (from.elem.kind === 'prim' && to.elem.kind === 'prim' && from.elem.name !== to.elem.name)
      );
    return needsReferenceCastBridge(from.elem, to.elem, ctx);
  }
  if (from.kind === 'array' || to.kind === 'array') {
    const other = from.kind === 'array' ? to : from;
    return (
      other.kind === 'class' &&
      !['java/lang/Object', 'java/lang/Cloneable', 'java/io/Serializable'].includes(other.name)
    );
  }
  if (from.kind !== 'class' || to.kind !== 'class' || from.name === to.name) return false;
  if (subtype(from.name, to.name, ctx) || subtype(to.name, from.name, ctx)) return false;
  const source = hierarchy(from.name, ctx);
  const target = hierarchy(to.name, ctx);
  return !(
    source &&
    target &&
    !source.final &&
    !target.final &&
    (source.interface || target.interface)
  );
}
