import type { Instr } from '../bytecode/decode.js';
import type { MethodInfo } from '../classfile/model.js';
import type { VerificationType } from '../classfile/stackmap.js';
import { parseMethodDescriptor } from '../classfile/types.js';

const width = (type: VerificationType) => (type.tag === 3 || type.tag === 4 ? 2 : 1);

export function validateStackMaps(method: MethodInfo, instructions: Instr[]): void {
  const code = method.code!;
  const boundaries = new Map(instructions.map((i) => [i.pc, i]));
  for (const entry of code.exceptions) {
    if (
      !boundaries.has(entry.startPc) ||
      entry.endPc <= entry.startPc ||
      (entry.endPc !== code.code.length && !boundaries.has(entry.endPc)) ||
      !boundaries.has(entry.handlerPc)
    )
      throw new Error('Invalid exception table boundary');
  }
  let locals: number[] = method.access & 8 ? [] : [1];
  locals.push(
    ...parseMethodDescriptor(method.descriptor).params.map((t) =>
      t.kind === 'prim' && ['long', 'double'].includes(t.name) ? 2 : 1,
    ),
  );
  for (const frame of code.stackMapFrames ?? []) {
    if (!boundaries.has(frame.offset))
      throw new Error('StackMapTable frame is not at an instruction boundary');
    if (frame.full) locals = frame.locals.map(width);
    else {
      if (frame.chop > locals.length) throw new Error('StackMapTable chops unavailable locals');
      locals.length -= frame.chop;
      locals.push(...frame.locals.map(width));
    }
    if (locals.reduce((n, w) => n + w, 0) > code.maxLocals)
      throw new Error('StackMapTable locals exceed max_locals');
    if (frame.stack.reduce((n, t) => n + width(t), 0) > code.maxStack)
      throw new Error('StackMapTable stack exceeds max_stack');
    for (const t of [...frame.locals, ...frame.stack]) {
      if (t.tag === 8 && boundaries.get(t.offset)?.op !== 0xbb)
        throw new Error('StackMapTable uninitialized value does not reference new');
      if (t.tag === 6 && method.name !== '<init>')
        throw new Error('StackMapTable uninitializedThis outside a constructor');
    }
  }
}
