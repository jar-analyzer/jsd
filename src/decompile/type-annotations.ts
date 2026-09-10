import type { Ann, TypeAnnotation } from '../classfile/model.js';
import type { JType, TypeParam } from '../classfile/types.js';
import type { Ctx } from './context.js';

export function annotatedType(
  type: JType,
  annotations: readonly TypeAnnotation[] | undefined,
  ctx: Ctx,
): JType {
  if (!annotations?.length) return type;
  const result = structuredClone(type);
  const expand = (node: JType, seen = new Set<string>()): void => {
    if (node.kind !== 'class' || node.owner || seen.has(node.name)) return;
    seen.add(node.name);
    const entry = ctx.innerClass(node.name);
    if (entry?.outer && !(entry.access & 8)) {
      node.owner = { kind: 'class', name: entry.outer };
      expand(node.owner, seen);
    }
  };
  const chain = (node: JType): JType[] => {
    expand(node);
    return node.kind === 'class' && node.owner ? [...chain(node.owner), node] : [node];
  };
  for (const entry of annotations) {
    ctx.budget.check(1 + entry.path.length);
    let nodes = chain(result),
      index = 0;
    for (const step of entry.path) {
      const node = nodes[index];
      if (step.kind === 1) {
        if (++index >= nodes.length)
          throw new Error('Type annotation references a missing inner type');
        continue;
      }
      const child =
        step.kind === 0 && node.kind === 'array'
          ? node.elem
          : step.kind === 2 && node.kind === 'wildcard'
            ? (node.bound ?? node.superBound)
            : step.kind === 3 && node.kind === 'class'
              ? node.args?.[step.index]
              : undefined;
      if (!child) throw new Error('Type annotation path does not match its type');
      nodes = chain(child);
      index = 0;
    }
    (nodes[index].annotations ??= []).push(entry.annotation);
  }
  return result;
}

export function annotatedTypeParams(
  params: TypeParam[],
  annotations: readonly TypeAnnotation[] | undefined,
  target: number,
  ctx: Ctx,
): TypeParam[] {
  return params.map((param, index) => {
    const entries = annotations?.filter((entry) => entry.index === index) ?? [];
    return {
      ...param,
      annotations: entries
        .filter((entry) => entry.targetType === target)
        .map((entry) => entry.annotation),
      classBound: param.classBound
        ? annotatedType(
            param.classBound,
            entries.filter((entry) => entry.targetType === target + 0x11 && entry.boundIndex === 0),
            ctx,
          )
        : null,
      ifaceBounds: param.ifaceBounds.map((bound, i) =>
        annotatedType(
          bound,
          entries.filter(
            (entry) => entry.targetType === target + 0x11 && entry.boundIndex === i + 1,
          ),
          ctx,
        ),
      ),
    };
  });
}

export function declarationAnnotations(
  declarations: Ann[],
  types: readonly TypeAnnotation[] | undefined,
  target: number,
): Ann[] {
  const roots =
    types?.filter((entry) => entry.targetType === target && entry.path.length === 0) ?? [];
  const key = (ann: Ann) =>
    JSON.stringify(ann, (_, value) => (typeof value === 'bigint' ? `${value}n` : value));
  return declarations.filter((ann) => !roots.some((entry) => key(entry.annotation) === key(ann)));
}

export function hasTypeAnnotations(type: JType): boolean {
  return (
    !!type.annotations?.length ||
    (type.kind === 'array' && hasTypeAnnotations(type.elem)) ||
    (type.kind === 'class' &&
      ((!!type.owner && hasTypeAnnotations(type.owner)) ||
        !!type.args?.some(hasTypeAnnotations))) ||
    (type.kind === 'wildcard' &&
      ((!!type.bound && hasTypeAnnotations(type.bound)) ||
        (!!type.superBound && hasTypeAnnotations(type.superBound))))
  );
}
