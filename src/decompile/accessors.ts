import type { Expr } from '../ast/ast.js';
import { decodeBytecode } from '../bytecode/decode.js';
import { Acc, type ClassFile, type MethodInfo } from '../classfile/model.js';
import { parseFieldDescriptor, parseMethodDescriptor } from '../classfile/types.js';
import type { Ctx } from './context.js';

export function recoverInnerAccessor(
  ctx: Ctx,
  cls: ClassFile,
  method: MethodInfo,
  args?: Expr[],
): Expr | undefined {
  if (
    !(method.access & Acc.Static) ||
    (method.access & (Acc.Synchronized | Acc.Strict)) !== 0 ||
    !(method.synthetic || method.access & Acc.Synthetic) ||
    !/^access\$\d+$/.test(method.name) ||
    !method.code ||
    method.code.exceptions.length ||
    method.code.typeAnnotations?.length
  )
    return;
  const inner = cls.innerClasses.find((entry) => entry.inner === cls.name);
  if (!inner || inner.access & Acc.Static || (!inner.outer && !cls.enclosing)) return;
  const seen = new Set<string>();
  let parent: ClassFile | undefined = cls;
  while (parent) {
    if (seen.has(parent.name) || parent.methods.some((entry) => entry.name === '<clinit>')) return;
    const interfaces = [...parent.interfaces];
    const visitedInterfaces = new Set<string>();
    while (interfaces.length) {
      const name = interfaces.pop()!;
      if (visitedInterfaces.has(name)) continue;
      visitedInterfaces.add(name);
      if (
        [
          'java/lang/Iterable',
          'java/lang/AutoCloseable',
          'java/lang/Cloneable',
          'java/io/Serializable',
        ].includes(name)
      )
        continue;
      const info = ctx.lookup(name);
      if (!info || info.methods.some((entry) => entry.name === '<clinit>')) return;
      interfaces.push(...info.interfaces);
    }
    seen.add(parent.name);
    if (!parent.superName || parent.superName === 'java/lang/Object') break;
    parent = ctx.lookup(parent.superName);
    if (!parent) return;
  }
  const descriptor = parseMethodDescriptor(method.descriptor);
  if (descriptor.params[0]?.kind !== 'class' || descriptor.params[0].name !== cls.name) return;
  const values =
    args ??
    descriptor.params.map((jtype, slot) => ({
      kind: 'local' as const,
      slot,
      name: `arg${slot}`,
      jtype,
    }));
  if (values.length !== descriptor.params.length) return;
  const instructions = decodeBytecode(method.code.code);
  const names = instructions.map((instruction) => instruction.name).join(' ');
  const fieldInstruction = instructions.find(
    (instruction) => instruction.name === 'getfield' || instruction.name === 'putfield',
  );
  if (fieldInstruction) {
    const field = cls.cp.memberRef(fieldInstruction.cpIndex!);
    const info = cls.fields.find(
      (entry) => entry.name === field.name && entry.descriptor === field.descriptor,
    );
    if (field.owner !== cls.name || !info || info.access & Acc.Static) return;
    if (
      instructions.some((instruction) => {
        if (instruction.name !== 'getfield' && instruction.name !== 'putfield') return false;
        const other = cls.cp.memberRef(instruction.cpIndex!);
        return (
          other.owner !== field.owner ||
          other.name !== field.name ||
          other.descriptor !== field.descriptor
        );
      })
    )
      return;
    const jtype = parseFieldDescriptor(field.descriptor);
    const prefix =
      field.descriptor === 'J'
        ? 'l'
        : field.descriptor === 'F'
          ? 'f'
          : field.descriptor === 'D'
            ? 'd'
            : field.descriptor.startsWith('L') || field.descriptor.startsWith('[')
              ? 'a'
              : 'i';
    const wide = prefix === 'l' || prefix === 'd';
    const duplication = wide ? 'dup2_x1' : 'dup_x1';
    const get: Expr = {
      kind: 'field-get',
      owner: field.owner,
      name: field.name,
      target: values[0],
      jtype,
    };
    if (
      descriptor.params.length === 1 &&
      names === `aload_0 getfield ${prefix}return` &&
      method.descriptor.endsWith(')' + field.descriptor)
    )
      return get;
    const target = {
      kind: 'field' as const,
      owner: field.owner,
      name: field.name,
      target: values[0],
      jtype,
    };
    if (
      descriptor.params.length === 2 &&
      method.descriptor === `(L${cls.name};${field.descriptor})${field.descriptor}` &&
      names === `aload_0 ${prefix}load_1 ${duplication} putfield ${prefix}return`
    )
      return { kind: 'assign-expr', target, expr: values[1] };
    if (
      descriptor.params.length !== 1 ||
      !method.descriptor.endsWith(')' + field.descriptor) ||
      !['i', 'l', 'f', 'd'].includes(prefix) ||
      field.descriptor === 'Z'
    )
      return;
    const narrowing =
      ({ B: ' i2b', C: ' i2c', S: ' i2s' } as Record<string, string>)[field.descriptor] ?? '';
    for (const operator of ['add', 'sub']) {
      const arithmetic = `${prefix}const_1 ${prefix}${operator}${narrowing}`;
      if (names === `aload_0 dup getfield ${duplication} ${arithmetic} putfield ${prefix}return`)
        return { kind: 'unary', op: operator === 'add' ? 'x++' : 'x--', operand: get, jtype };
      if (names === `aload_0 dup getfield ${arithmetic} ${duplication} putfield ${prefix}return`)
        return { kind: 'unary', op: operator === 'add' ? '++x' : '--x', operand: get, jtype };
    }
    return;
  }
  const call = instructions[instructions.length - 2];
  if (call?.name !== 'invokespecial') return;
  const ref = cls.cp.memberRef(call.cpIndex!);
  const callee = cls.methods.find(
    (entry) => entry.name === ref.name && entry.descriptor === ref.descriptor,
  );
  if (ref.owner !== cls.name || !callee || !(callee.access & Acc.Private) || ref.name === '<init>')
    return;
  if (method.descriptor !== `(L${cls.name};${ref.descriptor.slice(1)}`) return;
  let slot = 0;
  const loads = descriptor.params.map((type) => {
    const prefix =
      type.kind !== 'prim'
        ? 'a'
        : type.name === 'long'
          ? 'l'
          : type.name === 'float'
            ? 'f'
            : type.name === 'double'
              ? 'd'
              : 'i';
    const name = slot <= 3 ? `${prefix}load_${slot}` : `${prefix}load`;
    const currentSlot = slot;
    slot += prefix === 'l' || prefix === 'd' ? 2 : 1;
    return { name, slot: currentSlot };
  });
  if (
    instructions.length !== loads.length + 2 ||
    loads.some(
      (load, index) =>
        instructions[index].name !== load.name ||
        (instructions[index].local !== undefined && instructions[index].local !== load.slot),
    )
  )
    return;
  const ret = descriptor.ret;
  const returnName =
    ret.kind !== 'prim'
      ? 'areturn'
      : ret.name === 'void'
        ? 'return'
        : ret.name === 'long'
          ? 'lreturn'
          : ret.name === 'float'
            ? 'freturn'
            : ret.name === 'double'
              ? 'dreturn'
              : 'ireturn';
  if (instructions[instructions.length - 1].name !== returnName) return;
  return {
    kind: 'invoke',
    mode: 'special',
    owner: ref.owner,
    name: ref.name,
    descriptor: ref.descriptor,
    target: { kind: 'cast', jtype: { kind: 'class', name: cls.name }, expr: values[0] },
    args: values.slice(1),
  };
}
