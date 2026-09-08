import type { Expr } from '../../ast/ast.js';
import type { Instr } from '../../bytecode/decode.js';
import type { BootstrapArg } from '../../classfile/model.js';
import { parseMethodDescriptor } from '../../classfile/types.js';
import { bootstrapDescriptors } from '../bootstrap.js';
import type { Simulator } from './index.js';
import { bootstrapConstant, ConstantResolutionError, methodTypeExpression } from './constants.js';

export function cachedConcat(
  sim: Simulator,
  ins: Instr,
  descriptor: string,
  args: Expr[],
  recipe: string,
  constants: BootstrapArg[],
): Expr {
  if (sim.cls.enclosing)
    throw new ConstantResolutionError(
      'Dynamic concat caching in local/anonymous classes is not yet reconstructed',
      'UNSUPPORTED_INVOKEDYNAMIC',
    );
  let calls = sim.ctx.dynamicConcats.get(sim.cls);
  if (!calls) sim.ctx.dynamicConcats.set(sim.cls, (calls = new Map()));
  const key = `${sim.method.name}${sim.method.descriptor}@${ins.pc}`;
  let call = calls.get(key);
  if (!call) {
    const values = constants.map((arg) => bootstrapConstant(sim.cls, arg, new Set(), sim.ctx));
    if (values.some((value) => value.kind === 'const' && value.ctype === 'null'))
      throw new ConstantResolutionError(
        'Concat static constants must not be null',
        'INVALID_BOOTSTRAP',
      );
    let entries = sim.ctx.dynamicConstants.get(sim.cls);
    if (!entries) sim.ctx.dynamicConstants.set(sim.cls, (entries = new Map()));
    const names = new Set([
      ...sim.cls.methods.map((m) => m.name),
      ...sim.cls.fields.map((f) => f.name),
      ...sim.cls.innerClasses.map((c) => c.innerName),
      ...[...entries.values()].flatMap((e) => [e.name, e.name + '$State']),
      ...[...calls.values()].map((c) => c.name),
    ]);
    let name = `$jsd$concat$${ins.cpIndex}$${ins.pc}`;
    while (names.has(name) || names.has(name + '$handle') || names.has(name + '$handle$State'))
      name += '$';
    const handleName = name + '$handle';
    const factory: Expr = {
      kind: 'invoke',
      mode: 'static',
      owner: 'java/lang/invoke/StringConcatFactory',
      name: 'makeConcatWithConstants',
      descriptor: bootstrapDescriptors.makeConcatWithConstants,
      args: [
        {
          kind: 'invoke',
          mode: 'static',
          owner: 'java/lang/invoke/MethodHandles',
          name: 'lookup',
          descriptor: '()Ljava/lang/invoke/MethodHandles$Lookup;',
          args: [],
        },
        { kind: 'const', ctype: 'string', value: 'concat' },
        methodTypeExpression(descriptor),
        { kind: 'const', ctype: 'string', value: recipe },
        { kind: 'array-init', elemType: { kind: 'class', name: 'java/lang/Object' }, values },
      ],
    };
    entries.set(`concat:${key}`, {
      name: handleName,
      type: { kind: 'class', name: 'java/lang/invoke/MethodHandle' },
      expr: {
        kind: 'invoke',
        mode: 'virtual',
        owner: 'java/lang/invoke/CallSite',
        name: 'getTarget',
        descriptor: '()Ljava/lang/invoke/MethodHandle;',
        target: factory,
        args: [],
      },
    });
    call = { name, handleName, params: parseMethodDescriptor(descriptor).params };
    calls.set(key, call);
  }
  return { kind: 'invoke', mode: 'static', owner: sim.cls.name, name: call.name, descriptor, args };
}
