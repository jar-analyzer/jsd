import { Expr, Stmt } from '../../ast/ast.js';
import { Instr } from '../../bytecode/decode.js';
import type { BootstrapMethod } from '../../classfile/model.js';
import { JType, parseMethodDescriptor } from '../../classfile/types.js';
import { bootstrapDescriptors, matchesBootstrap } from '../bootstrap.js';
import { errorMessage } from '../diagnostics.js';
import { SimFail, type SwitchLabel } from './result.js';
import type { ExprStack } from './stack.js';
import { STR } from './helpers.js';
import type { Simulator } from './index.js';
import { bootstrapConstant, methodTypeExpression, ConstantResolutionError } from './constants.js';

function invalid(message: string): never {
  throw new ConstantResolutionError(message, 'INVALID_BOOTSTRAP');
}

function interfaceMethods(
  sim: Simulator,
  name: string,
  visiting = new Set<string>(),
): { name: string; descriptor: string }[] | null {
  if (['java/io/Serializable', 'java/lang/Cloneable'].includes(name)) return [];
  if (visiting.has(name)) return null;
  const cls = sim.ctx.lookup(name);
  if (!cls || !(cls.access & 0x0200) || cls.permitted.length) return null;
  visiting.add(name);
  const methods = cls.methods
    .filter((m) => m.access & 0x0400)
    .map((m) => ({ name: m.name, descriptor: m.descriptor }));
  for (const parent of cls.interfaces) {
    const inherited = interfaceMethods(sim, parent, visiting);
    if (!inherited) return null;
    methods.push(...inherited);
  }
  visiting.delete(name);
  return methods;
}

function validateLambda(
  bsm: BootstrapMethod,
  alt: boolean,
  capturedCount: number,
  sim: Simulator,
  samName: string,
  target: string,
): string[] {
  const [sam, impl, instantiated] = bsm.args;
  if (
    sam?.kind !== 'methodType' ||
    impl?.kind !== 'methodHandle' ||
    instantiated?.kind !== 'methodType'
  )
    invalid('Lambda bootstrap requires MethodType, MethodHandle, MethodType arguments in order');
  const samType = parseMethodDescriptor(sam.descriptor);
  const instType = parseMethodDescriptor(instantiated.descriptor);
  const implType = parseMethodDescriptor(impl.handle.ref.descriptor);
  const receiver = [5, 7, 9].includes(impl.handle.kind) ? 1 : 0;
  if (capturedCount + samType.params.length !== implType.params.length + receiver)
    invalid('Lambda capture and parameter counts do not match its implementation handle');
  if (
    samType.params.length !== instType.params.length ||
    impl.handle.kind < 5 ||
    impl.handle.kind > 9
  )
    invalid('Invalid lambda implementation handle or parameter counts');
  if (!impl.handle.ref.name.startsWith('lambda$') && capturedCount > receiver)
    throw new ConstantResolutionError(
      'Captured implementation arguments cannot be represented as a Java method reference',
      'UNSUPPORTED_INVOKEDYNAMIC',
    );
  if (!alt && bsm.args.length !== 3) invalid('Unexpected metafactory arguments');
  const interfaces: string[] = [];
  const bridgeMethods = new Set(
    (interfaceMethods(sim, target) ?? [])
      .filter((m) => m.name === samName)
      .map((m) => m.descriptor),
  );
  if (alt) {
    const flags = bsm.args[3];
    if (flags?.kind !== 'int') invalid('Missing altMetafactory flags');
    if (flags.value < 0 || (flags.value & ~7) !== 0) invalid('Unknown altMetafactory flags');
    if (flags.value & 1) interfaces.push('java/io/Serializable');
    let cursor = 4;
    const seenBridges = new Set<string>();
    for (const flag of [2, 4]) {
      if (!(flags.value & flag)) continue;
      const count = bsm.args[cursor++];
      if (count?.kind !== 'int' || count.value < 0 || count.value > bsm.args.length - cursor)
        invalid('Invalid altMetafactory extra argument count');
      for (let i = 0; i < count.value; i++) {
        const arg = bsm.args[cursor++];
        if (flag === 2) {
          if (arg.kind !== 'type') invalid('Lambda marker must be a Class');
          const methods = interfaceMethods(sim, arg.typeName);
          const compatible = methods?.every((m) => {
            const type = parseMethodDescriptor(m.descriptor);
            return (
              m.name === samName &&
              m.descriptor.slice(0, m.descriptor.indexOf(')') + 1) ===
                sam.descriptor.slice(0, sam.descriptor.indexOf(')') + 1) &&
              (JSON.stringify(type.ret) === JSON.stringify(instType.ret) ||
                (type.ret.kind === 'class' &&
                  type.ret.name === 'java/lang/Object' &&
                  instType.ret.kind !== 'prim'))
            );
          });
          if (!compatible)
            throw new ConstantResolutionError(
              'Unverified lambda intersection interface: ' + arg.typeName,
              'UNSUPPORTED_INVOKEDYNAMIC',
            );
          for (const method of methods!) bridgeMethods.add(method.descriptor);
          interfaces.push(arg.typeName);
        } else {
          if (arg.kind !== 'methodType') invalid('Lambda bridge must be a MethodType');
          parseMethodDescriptor(arg.descriptor);
          if (arg.descriptor === sam.descriptor || seenBridges.has(arg.descriptor))
            invalid('Duplicate lambda bridge signature');
          seenBridges.add(arg.descriptor);
          if (!bridgeMethods.has(arg.descriptor))
            throw new ConstantResolutionError(
              'Unverified lambda bridge signature',
              'UNSUPPORTED_INVOKEDYNAMIC',
            );
        }
      }
    }
    if (cursor !== bsm.args.length) invalid('Unexpected altMetafactory arguments');
  }
  return [...new Set(interfaces)];
}

function restartIsZero(simulator: Simulator, value: Expr): boolean {
  if (value.kind === 'const') return value.ctype === 'int' && value.value === 0;
  if (value.kind !== 'local') return false;
  const params = parseMethodDescriptor(simulator.method.descriptor).params;
  const parameterSlots = params.reduce(
    (n, p) => n + (p.kind === 'prim' && (p.name === 'long' || p.name === 'double') ? 2 : 1),
    simulator.isStatic ? 0 : 1,
  );
  if (value.slot < parameterSlots) return false;
  const reachable = new Set<number>();
  const pending = [simulator.cfg.entry];
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...simulator.cfg.blocks[id].succs);
  }
  let stores = 0;
  for (const id of reachable) {
    const block = simulator.cfg.blocks[id];
    for (let i = 0; i < block.instrs.length; i++) {
      const ins = block.instrs[i];
      if (ins.local !== value.slot) continue;
      if (ins.name === 'iinc') return false;
      if (/^(?:wide )?istore/.test(ins.name)) {
        if (i === 0 || block.instrs[i - 1].op !== 0x03) return false;
        stores++;
      }
    }
  }
  return stores > 0;
}

function execute(this: Simulator, ins: Instr, stack: ExprStack, stmts: Stmt[]): void {
  const d = this.cls.cp.dynamic(ins.cpIndex!, 'callsite');
  const bsm = this.cls.bootstrapMethods[d.bsm];
  if (!bsm) invalid('Missing bootstrap method #' + d.bsm);
  const is = (owner: string, name: keyof typeof bootstrapDescriptors) =>
    matchesBootstrap(
      bsm,
      owner,
      name === 'record' ? 'bootstrap' : name,
      bootstrapDescriptors[name],
    );
  const md = parseMethodDescriptor(d.descriptor);
  const args: Expr[] = [];
  for (const param of md.params.slice().reverse()) {
    const value = stack.popSE();
    if (value.w !== (param.kind === 'prim' && (param.name === 'long' || param.name === 'double')))
      invalid('Dynamic call argument has an incompatible operand stack width');
    args.unshift(value.e);
  }
  const concat = is('java/lang/invoke/StringConcatFactory', 'makeConcat');
  const concatConstants = is('java/lang/invoke/StringConcatFactory', 'makeConcatWithConstants');
  if (concat || concatConstants) {
    if (md.ret.kind !== 'class' || md.ret.name !== 'java/lang/String')
      invalid('Concat must return String');
    const slots = md.params.reduce(
      (n, p) => n + (p.kind === 'prim' && (p.name === 'long' || p.name === 'double') ? 2 : 1),
      0,
    );
    if (slots > 200) invalid('Concat exceeds 200 argument slots');
    if (concat && bsm.args.length) invalid('makeConcat does not accept static arguments');
    const recipeArg = bsm.args[0];
    if (concatConstants && recipeArg?.kind !== 'string')
      invalid('Missing concat recipe as first bootstrap argument');
    const recipe =
      concatConstants && recipeArg.kind === 'string'
        ? recipeArg.value
        : '\u0001'.repeat(args.length);
    const constants = concatConstants ? bsm.args.slice(1) : [];
    if (
      [...recipe].filter((c) => c === '\u0001').length !== args.length ||
      [...recipe].filter((c) => c === '\u0002').length !== constants.length
    )
      invalid('Concat recipe placeholder counts do not match its arguments');
    const parts: Expr[] = [];
    const partTypes: (JType | undefined)[] = [];
    let argI = 0,
      constI = 0,
      literal = '';
    const flush = () => {
      if (literal) {
        parts.push({ kind: 'const', ctype: 'string', value: literal });
        partTypes.push(STR);
        literal = '';
      }
    };
    for (const ch of recipe) {
      if (ch === '\u0001') {
        flush();
        parts.push(args[argI]);
        partTypes.push(md.params[argI++]);
      } else if (ch === '\u0002') {
        flush();
        const constant = bootstrapConstant(this.cls, constants[constI++], new Set(), this.ctx);
        if (constant.kind === 'const' && constant.ctype === 'null')
          invalid('Concat static constants must not be null');
        parts.push(constant);
        partTypes.push(undefined);
      } else literal += ch;
    }
    flush();
    if (!parts.length || parts[0].kind !== 'const' || parts[0].ctype !== 'string') {
      parts.unshift({ kind: 'const', ctype: 'string', value: '' });
      partTypes.unshift(STR);
    }
    stack.push({ kind: 'concat', parts, partTypes, jtype: STR });
    return;
  }
  const lambda = is('java/lang/invoke/LambdaMetafactory', 'metafactory');
  const altLambda = is('java/lang/invoke/LambdaMetafactory', 'altMetafactory');
  if (lambda || altLambda) {
    if (md.ret.kind !== 'class') invalid('Lambda factory must return an interface reference');
    const interfaces = validateLambda(bsm, altLambda, md.params.length, this, d.name, md.ret.name);
    for (let i = 0; i < stack.items.length; i++)
      stack.items[i].e = this.preserveDiscarded(stack.items[i].e, ins.pc, -i - 1, stmts, true);
    stack.push({
      kind: 'invoke',
      mode: 'special',
      owner: 'java/lang/invoke/LambdaMetafactory',
      name: 'metafactory',
      descriptor: d.descriptor,
      args: args.map((arg, i) => this.preserveDiscarded(arg, ins.pc, i, stmts, true)),
      bootstrap: { name: d.name, index: d.bsm, interfaces },
    });
    return;
  }
  const typeSwitch = is('java/lang/runtime/SwitchBootstraps', 'typeSwitch');
  const enumSwitch = is('java/lang/runtime/SwitchBootstraps', 'enumSwitch');
  if (typeSwitch || enumSwitch) {
    if (
      md.params.length !== 2 ||
      md.params[0].kind === 'prim' ||
      md.params[1].kind !== 'prim' ||
      md.params[1].name !== 'int' ||
      md.ret.kind !== 'prim' ||
      md.ret.name !== 'int'
    )
      invalid('Invalid switch call site descriptor');
    const next = this.cfg.blocks.flatMap((b) => b.instrs).find((i) => i.pc === ins.pc + 5);
    if (!restartIsZero(this, args[1]) || !next || (next.op !== 0xaa && next.op !== 0xab)) {
      if (this.cls.enclosing)
        throw new ConstantResolutionError(
          'Dynamic switch caching in local/anonymous classes is not yet reconstructed',
          'UNSUPPORTED_INVOKEDYNAMIC',
        );
      let entries = this.ctx.dynamicConstants.get(this.cls);
      if (!entries) this.ctx.dynamicConstants.set(this.cls, (entries = new Map()));
      let switches = this.ctx.dynamicSwitches.get(this.cls);
      if (!switches) this.ctx.dynamicSwitches.set(this.cls, (switches = new Map()));
      let entry = switches.get(ins.cpIndex!);
      if (!entry) {
        let name = `$jsd$switch$${ins.cpIndex}`;
        const names = new Set([
          ...this.cls.methods.map((m) => m.name),
          ...this.cls.innerClasses.map((c) => c.innerName),
        ]);
        while (names.has(name) || names.has(name + '$handle') || names.has(name + '$handle$State'))
          name += '$';
        const handleName = name + '$handle';
        const factory: Expr = {
          kind: 'invoke',
          mode: 'static',
          ...bsm.ref.ref,
          args: [
            {
              kind: 'invoke',
              mode: 'static',
              owner: 'java/lang/invoke/MethodHandles',
              name: 'lookup',
              descriptor: '()Ljava/lang/invoke/MethodHandles$Lookup;',
              args: [],
            },
            { kind: 'const', ctype: 'string', value: d.name },
            methodTypeExpression(d.descriptor),
            {
              kind: 'array-init',
              elemType: { kind: 'class', name: 'java/lang/Object' },
              values: bsm.args.map((arg) => bootstrapConstant(this.cls, arg, new Set(), this.ctx)),
            },
          ],
        };
        entries.set(-ins.cpIndex!, {
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
        entry = { name, handleName, selector: md.params[0] };
        switches.set(ins.cpIndex!, entry);
      }
      stack.push({
        kind: 'invoke',
        mode: 'static',
        owner: this.cls.name,
        name: entry.name,
        descriptor: d.descriptor,
        args,
      });
      return;
    }
    const labels: SwitchLabel[] = bsm.args.map((arg) => {
      if (typeSwitch && arg.kind === 'type') return { kind: 'type', text: arg.typeName };
      if (
        enumSwitch &&
        arg.kind === 'string' &&
        /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(arg.value)
      )
        return { kind: 'constant', text: arg.value };
      if (typeSwitch && arg.kind === 'dynamic') {
        const value = bootstrapConstant(this.cls, arg);
        if (
          value.kind === 'invoke' &&
          value.owner === 'java/lang/Enum$EnumDesc' &&
          value.name === 'of'
        ) {
          const [classDesc, name] = value.args;
          if (classDesc.kind === 'invoke' && name.kind === 'const' && name.ctype === 'string') {
            const binaryName = classDesc.args[0];
            if (binaryName.kind === 'const' && binaryName.ctype === 'string') {
              const raw = String(binaryName.value);
              const internal =
                classDesc.name === 'ofDescriptor' ? raw.slice(1, -1) : raw.replace(/\./g, '/');
              if (
                (classDesc.name !== 'ofDescriptor' || /^L[^;]+;$/.test(raw)) &&
                internal
                  .split('/')
                  .every((part) => /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(part)) &&
                /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(String(name.value))
              )
                return {
                  kind: 'constant',
                  text: `${internal.replace(/[/\$]/g, '.')}.${name.value}`,
                };
            }
          }
        }
      }
      throw new ConstantResolutionError(
        'Unsupported switch bootstrap label',
        'UNSUPPORTED_INVOKEDYNAMIC',
      );
    });
    if (!labels.length)
      throw new ConstantResolutionError(
        'Empty switch bootstrap labels',
        'UNSUPPORTED_INVOKEDYNAMIC',
      );
    this.sim.switchCaseTypes.set(ins.pc, labels);
    stack.push(args[0]);
    return;
  }
  if (is('java/lang/runtime/ObjectMethods', 'record') && this.cls.recordComponents.length) {
    const cls = this.cls;
    const descriptors: Record<string, string> = {
      equals: `(L${cls.name};Ljava/lang/Object;)Z`,
      hashCode: `(L${cls.name};)I`,
      toString: `(L${cls.name};)Ljava/lang/String;`,
    };
    const [recordClass, names, ...getters] = bsm.args;
    const code = this.method.code?.code;
    const expectedCode =
      d.name === 'equals'
        ? [0x2a, 0x2b, 0xba, ins.cpIndex! >> 8, ins.cpIndex! & 255, 0, 0, 0xac]
        : [
            0x2a,
            0xba,
            ins.cpIndex! >> 8,
            ins.cpIndex! & 255,
            0,
            0,
            d.name === 'toString' ? 0xb0 : 0xac,
          ];
    const standard =
      code?.length === expectedCode.length &&
      expectedCode.every((byte, i) => code[i] === byte) &&
      d.name === this.method.name &&
      d.descriptor === descriptors[d.name] &&
      this.method.descriptor === d.descriptor.replace(`L${cls.name};`, '') &&
      args[0]?.kind === 'this' &&
      (d.name !== 'equals' || (args[1]?.kind === 'local' && args[1].slot === 1)) &&
      recordClass?.kind === 'type' &&
      recordClass.typeName === cls.name &&
      names?.kind === 'string' &&
      names.value === cls.recordComponents.map((c) => c.name).join(';') &&
      getters.length === cls.recordComponents.length &&
      getters.every(
        (arg, i) =>
          arg.kind === 'methodHandle' &&
          arg.handle.kind === 1 &&
          arg.handle.ref.owner === cls.name &&
          arg.handle.ref.name === cls.recordComponents[i].name &&
          arg.handle.ref.descriptor === cls.recordComponents[i].descriptor,
      );
    if (standard) {
      stack.push({ kind: 'raw', text: '/* record ObjectMethods */', jtype: md.ret });
      return;
    }
  }
  throw new ConstantResolutionError(
    `Unsupported bootstrap ${bsm.ref.ref.owner}.${bsm.ref.ref.name}${bsm.ref.ref.descriptor} (handle kind ${bsm.ref.kind})`,
    'UNSUPPORTED_INVOKEDYNAMIC',
  );
}

export const indyPart: ThisType<Simulator> & Pick<Simulator, 'execInvokeDynamic'> = {
  execInvokeDynamic(ins: Instr, stack: ExprStack, stmts: Stmt[]): void {
    try {
      execute.call(this, ins, stack, stmts);
    } catch (error) {
      this.ctx.diagnostics.add({
        code: error instanceof ConstantResolutionError ? error.code : 'INVALID_BOOTSTRAP',
        severity: 'error',
        stage: 'simulate',
        className: this.cls.name,
        methodName: this.method.name,
        descriptor: this.method.descriptor,
        bytecodeOffset: ins.pc,
        message: errorMessage(error),
      });
      throw new SimFail(errorMessage(error));
    }
  },
};
