import type { ClassFile, MethodInfo } from '../classfile/model.js';
import type { VerificationType } from '../classfile/stackmap.js';
import { parseFieldDescriptor, parseMethodDescriptor, type JType } from '../classfile/types.js';
import { branchSuccessors, isConditionalBranch, type Instr } from '../bytecode/decode.js';
import type { Ctx } from './context.js';
import { ExprStack } from './simulate/stack.js';

type State = { locals: Map<number, string>; stack: string[] };
const wide = (type: string) => type === 'J' || type === 'D';
const reference = (type: string) => type.startsWith('L') || type.startsWith('[');
const ref = (name: string) => (name.startsWith('[') ? name : `L${name};`);
const primitive: Record<string, string> = {
  int: 'I',
  boolean: 'I',
  byte: 'I',
  char: 'I',
  short: 'I',
  float: 'F',
  double: 'D',
  long: 'J',
  void: 'V',
};
const descriptorOf = (type: JType): string =>
  type.kind === 'array'
    ? '[' + descriptorOf(type.elem)
    : type.kind === 'prim'
      ? (({ boolean: 'Z', byte: 'B', char: 'C', short: 'S' } as Record<string, string>)[
          type.name
        ] ?? primitive[type.name])
      : type.kind === 'class'
        ? ref(type.name)
        : '?';
const typeOf = (type: JType): string =>
  type.kind === 'prim'
    ? primitive[type.name]
    : type.kind === 'class'
      ? ref(type.name)
      : type.kind === 'array'
        ? descriptorOf(type)
        : '?';

export function verifyFrames(
  ctx: Ctx,
  cls: ClassFile,
  method: MethodInfo,
  instructions: Instr[],
): void {
  const code = method.code!;
  if (!code.stackMapFrames?.length && !instructions.some((ins) => ins.op === 0xbb)) return;
  const byPc = new Map(instructions.map((ins) => [ins.pc, ins]));
  const initial: string[] =
    method.access & 8 ? [] : [method.name === '<init>' ? `Uthis:${cls.name}` : ref(cls.name)];
  initial.push(...parseMethodDescriptor(method.descriptor).params.map(typeOf));
  const slots = (types: string[]): Map<number, string> => {
    const locals = new Map<number, string>();
    let slot = 0;
    for (const type of types) {
      locals.set(slot++, type);
      if (wide(type)) locals.set(slot++, 'top');
    }
    return locals;
  };
  const verificationType = (type: VerificationType): string => {
    if (type.tag === 7) return ref(type.name);
    if (type.tag === 8)
      return `U${type.offset}:${cls.cp.className(byPc.get(type.offset)!.cpIndex!)}`;
    return ['top', 'I', 'F', 'D', 'J', 'null', `Uthis:${cls.name}`][type.tag];
  };
  const frames = new Map<number, State>();
  let localTypes = [...initial];
  for (const frame of code.stackMapFrames ?? []) {
    if (frame.full) localTypes = frame.locals.map(verificationType);
    else {
      localTypes.length -= frame.chop;
      localTypes.push(...frame.locals.map(verificationType));
    }
    frames.set(frame.offset, {
      locals: slots(localTypes),
      stack: frame.stack.map(verificationType),
    });
  }
  const compatible = (actual: string, expected: string): boolean => {
    if (expected === 'top' || actual === expected || actual === '?') return true;
    if (actual === 'null' && reference(expected)) return true;
    if (!reference(actual) || !reference(expected)) return false;
    if (expected === 'Ljava/lang/Object;') return true;
    if (actual.startsWith('[')) {
      if (['Ljava/lang/Cloneable;', 'Ljava/io/Serializable;'].includes(expected)) return true;
      if (!expected.startsWith('[')) return false;
      const a = actual.slice(1),
        e = expected.slice(1);
      return reference(a) && reference(e) ? compatible(a, e) : a === e;
    }
    if (expected.startsWith('[')) return false;
    const target = expected.slice(1, -1);
    const pending = [actual.slice(1, -1)];
    const seen = new Set<string>();
    let unknown = false;
    while (pending.length) {
      ctx.budget.check(1);
      const name = pending.pop()!;
      if (name === target) return true;
      if (seen.has(name)) continue;
      seen.add(name);
      if (name === 'java/lang/Object') continue;
      const known = ctx.lookup(name);
      if (!known) {
        unknown = true;
        continue;
      }
      if (known.superName) pending.push(known.superName);
      pending.push(...known.interfaces);
    }
    const finalTypes = new Set(
      [
        'String',
        'Boolean',
        'Byte',
        'Character',
        'Short',
        'Integer',
        'Long',
        'Float',
        'Double',
        'Class',
      ].map((name) => `Ljava/lang/${name};`),
    );
    if (finalTypes.has(actual) && finalTypes.has(expected)) return false;
    return unknown;
  };
  const checkpoints = new Set([
    0,
    ...frames.keys(),
    ...instructions.flatMap(branchSuccessors),
    ...code.exceptions.map((entry) => entry.handlerPc),
  ]);
  const states = new Map<number, State>();
  const pending: number[] = [];
  const queued = new Set<number>();
  const enqueue = (pc: number, incoming: State): void => {
    if (!byPc.has(pc)) return;
    const frame = frames.get(pc);
    if (frame) {
      if (
        incoming.stack.length !== frame.stack.length ||
        frame.stack.some((t, i) => !compatible(incoming.stack[i], t))
      )
        throw new Error(`StackMapTable operand type mismatch at ${pc}`);
      for (const [slot, type] of frame.locals)
        if (!compatible(incoming.locals.get(slot) ?? 'top', type))
          throw new Error(`StackMapTable local type mismatch at ${pc}, slot ${slot}`);
      incoming = frame;
    }
    if (!checkpoints.has(pc)) {
      states.set(pc, incoming);
      if (!queued.has(pc)) {
        pending.push(pc);
        queued.add(pc);
      }
      return;
    }
    ctx.budget.check(incoming.locals.size + incoming.stack.length);
    const previous = states.get(pc);
    let changed = !previous;
    const next: State = { locals: new Map(incoming.locals), stack: [...incoming.stack] };
    if (previous) {
      if (previous.stack.length !== next.stack.length)
        throw new Error(`Operand stack height mismatch at ${pc}`);
      const merge = (a: string, b: string): string =>
        a === b
          ? a
          : reference(a) && b === 'null'
            ? a
            : reference(b) && a === 'null'
              ? b
              : reference(a) && reference(b)
                ? '?'
                : 'top';
      for (const slot of new Set([...previous.locals.keys(), ...next.locals.keys()])) {
        const old = previous.locals.get(slot) ?? 'top';
        const value = merge(old, next.locals.get(slot) ?? 'top');
        next.locals.set(slot, value);
        changed ||= old !== value;
      }
      next.stack = next.stack.map((t, i) => {
        const value = merge(previous.stack[i], t);
        changed ||= value !== previous.stack[i];
        return value;
      });
    }
    if (!changed) return;
    states.set(pc, next);
    if (!queued.has(pc)) {
      pending.push(pc);
      queued.add(pc);
    }
  };
  enqueue(0, { locals: slots(initial), stack: [] });
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const pc = pending[cursor];
    queued.delete(pc);
    ctx.budget.check(1);
    const ins = byPc.get(pc)!;
    const input = states.get(pc)!;
    const state: State = checkpoints.has(pc)
      ? { locals: new Map(input.locals), stack: [...input.stack] }
      : input;
    if (!checkpoints.has(pc)) states.delete(pc);
    const pop = (): string => {
      const type = state.stack.pop();
      if (type === undefined) throw new Error(`Operand stack underflow at ${pc}`);
      return type;
    };
    const push = (type: string): void => {
      state.stack.push(type);
    };
    const requireType = (actual: string, expected: string): void => {
      if (!compatible(actual, expected)) throw new Error(`Invalid operand type at ${pc}`);
    };
    const op = ins.op,
      name = ins.name;
    for (const handler of code.exceptions) {
      if (pc >= handler.startPc && pc < handler.endPc)
        enqueue(handler.handlerPc, {
          locals: input.locals,
          stack: [ref(handler.catchType ?? 'java/lang/Throwable')],
        });
    }
    if (op === 0x00 || op === 0xa7 || op === 0xc8) {
    } else if (op === 0x01) push('null');
    else if ((op >= 0x02 && op <= 0x08) || op === 0x10 || op === 0x11) push('I');
    else if (op === 0x09 || op === 0x0a) push('J');
    else if (op >= 0x0b && op <= 0x0d) push('F');
    else if (op === 0x0e || op === 0x0f) push('D');
    else if (op >= 0x12 && op <= 0x14) {
      const value = cls.cp.constVal(ins.cpIndex!);
      const refs: Record<string, string> = {
        string: 'java/lang/String',
        class: 'java/lang/Class',
        methodtype: 'java/lang/invoke/MethodType',
        methodhandle: 'java/lang/invoke/MethodHandle',
      };
      push(
        value.type === 'dynamic'
          ? typeOf(parseFieldDescriptor(cls.cp.dynamic(ins.cpIndex!).descriptor))
          : (primitive[value.type] ?? ref(refs[value.type])),
      );
    } else if (/^[ilfda](load|store)(_|$)/.test(name)) {
      const slot = ins.local ?? Number(name.slice(name.lastIndexOf('_') + 1));
      const category = ({ i: 'I', l: 'J', f: 'F', d: 'D', a: 'A' } as Record<string, string>)[
        name[0]
      ];
      const value = name.includes('load') ? (state.locals.get(slot) ?? 'top') : pop();
      if (category === 'A') {
        if (!reference(value) && value !== 'null' && value !== '?' && !value.startsWith('U'))
          throw new Error(`Invalid reference local at ${pc}`);
      } else requireType(value, category);
      if (name.includes('load')) push(value);
      else {
        if (wide(state.locals.get(slot - 1) ?? '')) state.locals.set(slot - 1, 'top');
        state.locals.set(slot, value);
        if (wide(value)) state.locals.set(slot + 1, 'top');
      }
    } else if (op >= 0x2e && op <= 0x35) {
      requireType(pop(), 'I');
      const array = pop();
      push(
        op === 0x32
          ? array.startsWith('[')
            ? array.slice(1)
            : '?'
          : ['I', 'J', 'F', 'D', '?', 'I', 'I', 'I'][op - 0x2e],
      );
    } else if (op >= 0x4f && op <= 0x56) {
      pop();
      pop();
      pop();
    } else if (op === 0x57) {
      if (wide(pop())) throw new Error(`Invalid pop at ${pc}`);
    } else if (op === 0x58) {
      if (!wide(pop()) && wide(pop())) throw new Error(`Invalid pop2 at ${pc}`);
    } else if (op >= 0x59 && op <= 0x5f) {
      const stack = new ExprStack();
      const types = [...state.stack];
      types.forEach((type, slot) => stack.push({ kind: 'local', slot, name: '' }, wide(type)));
      const operation = ['dup', 'dupX1', 'dupX2', 'dup2', 'dup2X1', 'dup2X2', 'swap'][
        op - 0x59
      ] as 'dup';
      stack[operation]();
      state.stack = stack.items.map((item) => types[(item.e as { slot: number }).slot]);
    } else if (op >= 0x60 && op <= 0x83) {
      const type = op <= 0x77 ? ['I', 'J', 'F', 'D'][(op - 0x60) % 4] : op % 2 ? 'J' : 'I';
      pop();
      if (op < 0x74 || op > 0x77) pop();
      push(type);
    } else if (op === 0x84) requireType(state.locals.get(ins.local!) ?? 'top', 'I');
    else if (op >= 0x85 && op <= 0x93) {
      pop();
      push(['J', 'F', 'D', 'I', 'F', 'D', 'I', 'J', 'D', 'I', 'J', 'F', 'I', 'I', 'I'][op - 0x85]);
    } else if (op >= 0x94 && op <= 0x98) {
      pop();
      pop();
      push('I');
    } else if ((op >= 0x99 && op <= 0xa6) || op === 0xc6 || op === 0xc7) {
      pop();
      if (op >= 0x9f && op <= 0xa6) pop();
    } else if (op === 0xaa || op === 0xab) pop();
    else if (op >= 0xac && op <= 0xb1) {
      if (op !== 0xb1) requireType(pop(), typeOf(parseMethodDescriptor(method.descriptor).ret));
    } else if (op >= 0xb2 && op <= 0xb5) {
      const member = cls.cp.memberRef(ins.cpIndex!);
      const type = typeOf(parseFieldDescriptor(member.descriptor));
      if (op === 0xb3 || op === 0xb5) requireType(pop(), type);
      if (op === 0xb4 || op === 0xb5) pop();
      if (op === 0xb2 || op === 0xb4) push(type);
    } else if (op >= 0xb6 && op <= 0xba) {
      const member =
        op === 0xba
          ? { ...cls.cp.dynamic(ins.cpIndex!), owner: '' }
          : cls.cp.memberRef(ins.cpIndex!);
      const descriptor = parseMethodDescriptor(member.descriptor);
      if (
        op === 0xb9 &&
        ins.count !== descriptor.params.reduce((n, t) => n + (wide(typeOf(t)) ? 2 : 1), 1)
      )
        throw new Error(`Invalid invokeinterface count at ${pc}`);
      for (const param of [...descriptor.params].reverse()) requireType(pop(), typeOf(param));
      if (op !== 0xb8 && op !== 0xba) {
        const target = pop();
        if (member.name === '<init>') {
          const owner = target.slice(target.indexOf(':') + 1);
          if (
            !target.startsWith('U') ||
            (target.startsWith('Uthis:')
              ? member.owner !== cls.name && member.owner !== cls.superName
              : member.owner !== owner)
          )
            throw new Error(`Constructor does not match uninitialized value at ${pc}`);
          const initialized = ref(owner);
          state.stack = state.stack.map((value) => (value === target ? initialized : value));
          for (const [slot, value] of state.locals)
            if (value === target) state.locals.set(slot, initialized);
        } else requireType(target, ref(member.owner));
      }
      if (descriptor.ret.kind !== 'prim' || descriptor.ret.name !== 'void')
        push(typeOf(descriptor.ret));
    } else if (op === 0xbb) push(`U${pc}:${cls.cp.className(ins.cpIndex!)}`);
    else if (op === 0xbc || op === 0xbd) {
      pop();
      push(
        op === 0xbd
          ? '[' + ref(cls.cp.className(ins.cpIndex!))
          : '[' + ['Z', 'C', 'F', 'D', 'B', 'S', 'I', 'J'][ins.atype! - 4],
      );
    } else if (op === 0xbe) {
      pop();
      push('I');
    } else if (op === 0xbf || op === 0xc2 || op === 0xc3) pop();
    else if (op === 0xc0) {
      pop();
      push(ref(cls.cp.className(ins.cpIndex!)));
    } else if (op === 0xc1) {
      pop();
      push('I');
    } else if (op === 0xc5) {
      for (let i = 0; i < ins.dims!; i++) pop();
      push(ref(cls.cp.className(ins.cpIndex!)));
    } else return;
    if (state.stack.reduce((n, t) => n + (wide(t) ? 2 : 1), 0) > code.maxStack)
      throw new Error(`Operand stack exceeds max_stack at ${pc}`);
    for (const target of branchSuccessors(ins)) enqueue(target, state);
    if (
      (!(op >= 0xac && op <= 0xb1) &&
        op !== 0xbf &&
        op !== 0xa7 &&
        op !== 0xc8 &&
        op !== 0xaa &&
        op !== 0xab) ||
      isConditionalBranch(op)
    )
      enqueue(pc + ins.size, state);
  }
}
