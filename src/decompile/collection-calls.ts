import type { Expr } from '../ast/ast.js';
import { expressionType } from '../ast/types.js';
import { parseClassSignature, parseSignature, type JType } from '../classfile/types.js';
import type { Ctx } from './context.js';

const lists = new Set([
  'List',
  'AbstractList',
  'AbstractSequentialList',
  'ArrayList',
  'LinkedList',
  'Vector',
  'Stack',
]);
const queues = new Set([
  'Queue',
  'Deque',
  'AbstractQueue',
  'ArrayDeque',
  'LinkedList',
  'PriorityQueue',
]);
const deques = new Set(['Deque', 'ArrayDeque', 'LinkedList']);
const collections = new Set([
  ...lists,
  ...queues,
  'Collection',
  'AbstractCollection',
  'Set',
  'AbstractSet',
  'SortedSet',
  'NavigableSet',
  'HashSet',
  'LinkedHashSet',
  'TreeSet',
]);
const maps = new Set([
  'Map',
  'AbstractMap',
  'SortedMap',
  'NavigableMap',
  'HashMap',
  'LinkedHashMap',
  'TreeMap',
  'Hashtable',
  'WeakHashMap',
  'IdentityHashMap',
  'concurrent/ConcurrentMap',
  'concurrent/ConcurrentHashMap',
  'concurrent/ConcurrentSkipListMap',
]);

type Parameter = 'object' | 'index' | number;

function parameters(owner: string, name: string, descriptor: string): Parameter[] | undefined {
  if (!owner.startsWith('java/util/')) return undefined;
  const type = owner.slice('java/util/'.length);
  const method = name + descriptor;
  if (['Iterator', 'ListIterator'].includes(type) && method === 'next()Ljava/lang/Object;')
    return [];
  if (type === 'ListIterator' && method === 'previous()Ljava/lang/Object;') return [];
  if (['Map$Entry', 'AbstractMap$SimpleEntry', 'AbstractMap$SimpleImmutableEntry'].includes(type)) {
    if (method === 'getKey()Ljava/lang/Object;' || method === 'getValue()Ljava/lang/Object;')
      return [];
    if (method === 'setValue(Ljava/lang/Object;)Ljava/lang/Object;') return [1];
  }
  if (collections.has(type)) {
    if (method === 'add(Ljava/lang/Object;)Z') return [0];
    if (method === 'contains(Ljava/lang/Object;)Z' || method === 'equals(Ljava/lang/Object;)Z')
      return ['object'];
    if (method === 'remove(Ljava/lang/Object;)Z') return ['object'];
  }
  if (lists.has(type)) {
    if (method === 'get(I)Ljava/lang/Object;' || method === 'remove(I)Ljava/lang/Object;')
      return ['index'];
    if (
      method === 'add(ILjava/lang/Object;)V' ||
      method === 'set(ILjava/lang/Object;)Ljava/lang/Object;'
    )
      return ['index', 0];
    if (method === 'indexOf(Ljava/lang/Object;)I' || method === 'lastIndexOf(Ljava/lang/Object;)I')
      return ['object'];
  }
  if (queues.has(type) && method === 'offer(Ljava/lang/Object;)Z') return [0];
  if (
    queues.has(type) &&
    ['remove', 'poll', 'element', 'peek'].some((n) => method === n + '()Ljava/lang/Object;')
  )
    return [];
  if (deques.has(type)) {
    if (['addFirst', 'addLast', 'push'].some((n) => method === n + '(Ljava/lang/Object;)V'))
      return [0];
    if (['offerFirst', 'offerLast'].some((n) => method === n + '(Ljava/lang/Object;)Z')) return [0];
    if (
      ['removeFirstOccurrence', 'removeLastOccurrence'].some(
        (n) => method === n + '(Ljava/lang/Object;)Z',
      )
    )
      return ['object'];
  }
  if (maps.has(type)) {
    if (
      ['put', 'putIfAbsent', 'replace'].some(
        (n) => method === n + '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;',
      )
    )
      return [0, 1];
    if (method === 'replace(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Z')
      return [0, 1, 1];
    if (method === 'getOrDefault(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;')
      return ['object', 1];
    if (method === 'remove(Ljava/lang/Object;Ljava/lang/Object;)Z') return ['object', 'object'];
    if (
      method === 'get(Ljava/lang/Object;)Ljava/lang/Object;' ||
      method === 'remove(Ljava/lang/Object;)Ljava/lang/Object;'
    )
      return ['object'];
    if (
      ['containsKey', 'containsValue', 'equals'].some((n) => method === n + '(Ljava/lang/Object;)Z')
    )
      return ['object'];
  }
  return undefined;
}

function sameType(a: JType, b: JType): boolean {
  if (a.kind === 'array' && b.kind === 'array') return sameType(a.elem, b.elem);
  if (a.kind === 'class' && b.kind === 'class')
    return (
      a.name === b.name &&
      ((!a.owner && !b.owner) || (!!a.owner && !!b.owner && sameType(a.owner, b.owner))) &&
      (a.args?.length ?? 0) === (b.args?.length ?? 0) &&
      (a.args ?? []).every((arg, i) => sameType(arg, b.args![i]))
    );
  return (a.kind === 'prim' || a.kind === 'typevar') && a.kind === b.kind && a.name === b.name;
}

function accepts(expected: JType, arg: Expr): boolean {
  if (arg.kind === 'const' && arg.ctype === 'null') return true;
  if (expected.kind === 'wildcard')
    return !!expected.superBound && accepts(expected.superBound, arg);
  const actual = expressionType(arg);
  if (!actual || actual.kind === 'prim') return false;
  return (
    (expected.kind === 'class' && expected.name === 'java/lang/Object') ||
    sameType(expected, actual)
  );
}

export function directCollectionCall(
  e: Extract<Expr, { kind: 'invoke' }>,
  ctx: Ctx,
  currentClass?: string,
): { eraseResult: boolean } | undefined {
  if (
    !e.target ||
    e.target.intersectionTypes?.length ||
    (!e.superCall && !['virtual', 'interface'].includes(e.mode)) ||
    ctx.lookup(e.owner)
  )
    return undefined;
  let receiver = expressionType(e.target);
  if (e.superCall) {
    const cls = currentClass ? ctx.lookup(currentClass) : undefined;
    if (!cls || cls.superName !== e.owner) return undefined;
    receiver = cls.signature
      ? parseClassSignature(cls.signature).superType
      : { kind: 'class', name: e.owner };
  } else if (e.target.kind === 'field-get') {
    const target = e.target;
    const field = ctx.lookup(target.owner)?.fields.find((field) => field.name === target.name);
    if (!field) return undefined;
    if (field.signature) {
      const signature = parseSignature(field.signature);
      if (!('kind' in signature)) return undefined;
      receiver = signature;
    }
  } else if (!['local', 'cast', 'new'].includes(e.target.kind)) return undefined;
  if (receiver?.kind !== 'class' || ctx.lookup(receiver.name)) return undefined;
  const wanted = parameters(e.owner, e.name, e.descriptor);
  const available = parameters(receiver.name, e.name, e.descriptor);
  if (!wanted || !available || wanted.length !== e.args.length) return undefined;
  const compatible = available.every((parameter, i) => {
    const arg = e.args[i];
    if (parameter === 'index') return true;
    if (parameter === 'object') {
      const actual = expressionType(arg);
      return (
        actual?.kind !== 'prim' &&
        (actual !== undefined || (arg.kind === 'const' && arg.ctype === 'null'))
      );
    }
    if (!receiver.args?.length) return expressionType(arg)?.kind !== 'prim';
    const expected = receiver.args[parameter];
    return !!expected && accepts(expected, arg);
  });
  return compatible ? { eraseResult: !!receiver.args?.length } : undefined;
}
