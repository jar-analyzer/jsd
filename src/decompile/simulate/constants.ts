import type { Ctx } from '../context.js';
import type { Expr } from '../../ast/ast.js';
import type { BootstrapArg, ClassFile } from '../../classfile/model.js';
import { parseFieldDescriptor, parseMethodDescriptor, type JType } from '../../classfile/types.js';
import { bootstrapDescriptors, matchesBootstrap } from '../bootstrap.js';
import type { DiagnosticCode } from '../diagnostics.js';

export class ConstantResolutionError extends Error {
  constructor(
    message: string,
    readonly code: DiagnosticCode = 'UNSUPPORTED_CONSTANT',
  ) {
    super(message);
  }
}

const classLiteral = (type: JType): Expr => ({ kind: 'class-literal', jtype: type });
export const classType = (name: string): JType =>
  name.startsWith('[') ? parseFieldDescriptor(name) : { kind: 'class', name };

export function methodTypeExpression(descriptor: string): Expr {
  const type = parseMethodDescriptor(descriptor);
  return {
    kind: 'invoke',
    mode: 'static',
    owner: 'java/lang/invoke/MethodType',
    name: 'methodType',
    descriptor: '(Ljava/lang/Class;[Ljava/lang/Class;)Ljava/lang/invoke/MethodType;',
    args: [
      classLiteral(type.ret),
      {
        kind: 'array-init',
        elemType: { kind: 'class', name: 'java/lang/Class' },
        values: type.params.map(classLiteral),
      },
    ],
  };
}

export function bootstrapConstant(
  cls: ClassFile,
  arg: BootstrapArg,
  visiting = new Set<number>(),
  ctx?: Ctx,
): Expr {
  switch (arg.kind) {
    case 'string':
    case 'int':
    case 'long':
    case 'float':
    case 'double':
      return { kind: 'const', ctype: arg.kind, value: arg.value };
    case 'type':
      return classLiteral(classType(arg.typeName));
    case 'methodType':
      return methodTypeExpression(arg.descriptor);
    case 'dynamic':
      return ctx
        ? cachedDynamicConstant(ctx, cls, arg.index, visiting)
        : dynamicConstant(cls, arg.index, visiting);
    case 'methodHandle':
      throw new ConstantResolutionError(
        `MethodHandle kind ${arg.handle.kind}: ${arg.handle.ref.owner}.${arg.handle.ref.name}${arg.handle.ref.descriptor} requires JVM lookup semantics`,
      );
  }
}

export function dynamicConstant(
  cls: ClassFile,
  index: number,
  visiting = new Set<number>(),
  ctx?: Ctx,
): Expr {
  if (visiting.has(index) || visiting.size >= 32)
    throw new ConstantResolutionError(
      `Cyclic or excessively nested dynamic constant at cp[${index}]`,
      'INVALID_BOOTSTRAP',
    );
  visiting.add(index);
  try {
    const dynamic = cls.cp.dynamic(index, 'constant');
    const type = parseFieldDescriptor(dynamic.descriptor);
    const bootstrap = cls.bootstrapMethods[dynamic.bsm];
    if (!bootstrap)
      throw new ConstantResolutionError(
        `Missing bootstrap #${dynamic.bsm} for cp[${index}]`,
        'INVALID_BOOTSTRAP',
      );
    const owner = 'java/lang/invoke/ConstantBootstraps';
    const is = (name: 'nullConstant' | 'primitiveClass' | 'enumConstant') =>
      matchesBootstrap(bootstrap, owner, name, bootstrapDescriptors[name]);
    if (is('nullConstant') && bootstrap.args.length === 0 && type.kind !== 'prim')
      return { kind: 'const', ctype: 'null', value: undefined, jtype: type };
    if (
      is('primitiveClass') &&
      bootstrap.args.length === 0 &&
      dynamic.descriptor === 'Ljava/lang/Class;' &&
      /^[ZBCSIJFDV]$/.test(dynamic.name)
    ) {
      const primitive =
        dynamic.name === 'V'
          ? { kind: 'prim' as const, name: 'void' as const }
          : parseFieldDescriptor(dynamic.name);
      return classLiteral(primitive);
    }
    if (
      is('enumConstant') &&
      bootstrap.args.length === 0 &&
      type.kind === 'class' &&
      /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(dynamic.name)
    )
      return {
        kind: 'cast',
        jtype: type,
        expr: {
          kind: 'invoke',
          mode: 'static',
          owner,
          name: 'enumConstant',
          descriptor: bootstrapDescriptors.enumConstant,
          args: [
            {
              kind: 'invoke',
              mode: 'static',
              owner: 'java/lang/invoke/MethodHandles',
              name: 'lookup',
              descriptor: '()Ljava/lang/invoke/MethodHandles$Lookup;',
              args: [],
            },
            { kind: 'const', ctype: 'string', value: dynamic.name },
            classLiteral(type),
          ],
        },
      };
    const implicitFinal = matchesBootstrap(
      bootstrap,
      owner,
      'getStaticFinal',
      bootstrapDescriptors.getStaticFinal,
    );
    const explicitFinal = matchesBootstrap(
      bootstrap,
      owner,
      'getStaticFinal',
      bootstrapDescriptors.getStaticFinalExplicit,
    );
    if (implicitFinal || explicitFinal) {
      if (bootstrap.args.length !== (explicitFinal ? 1 : 0))
        throw new ConstantResolutionError(
          'Invalid getStaticFinal argument count',
          'INVALID_BOOTSTRAP',
        );
      const declaring = explicitFinal
        ? bootstrapConstant(cls, bootstrap.args[0], visiting)
        : undefined;
      if (declaring && declaring.kind !== 'class-literal')
        throw new ConstantResolutionError(
          'getStaticFinal requires a declaring Class',
          'INVALID_BOOTSTRAP',
        );
      return {
        kind: 'cast',
        jtype: type,
        expr: {
          kind: 'invoke',
          mode: 'static',
          owner,
          name: 'getStaticFinal',
          descriptor: bootstrap.ref.ref.descriptor,
          args: [
            {
              kind: 'invoke',
              mode: 'static',
              owner: 'java/lang/invoke/MethodHandles',
              name: 'lookup',
              descriptor: '()Ljava/lang/invoke/MethodHandles$Lookup;',
              args: [],
            },
            { kind: 'const', ctype: 'string', value: dynamic.name },
            classLiteral(type),
            ...(declaring ? [declaring] : []),
          ],
        },
      };
    }
    if (matchesBootstrap(bootstrap, owner, 'invoke', bootstrapDescriptors.invoke)) {
      const [target, ...arguments_] = bootstrap.args;
      if (target?.kind === 'methodHandle' && target.handle.kind === 6) {
        const ref = target.handle.ref;
        const classDesc =
          ref.owner === 'java/lang/constant/ClassDesc' &&
          (target.handle.referenceTag === undefined || target.handle.referenceTag === 11) &&
          (ref.name === 'of' || ref.name === 'ofDescriptor') &&
          ref.descriptor === '(Ljava/lang/String;)Ljava/lang/constant/ClassDesc;' &&
          dynamic.descriptor === 'Ljava/lang/constant/ClassDesc;' &&
          arguments_.length === 1 &&
          arguments_[0].kind === 'string';
        const enumDesc =
          ref.owner === 'java/lang/Enum$EnumDesc' &&
          (target.handle.referenceTag === undefined || target.handle.referenceTag === 10) &&
          ref.name === 'of' &&
          ref.descriptor ===
            '(Ljava/lang/constant/ClassDesc;Ljava/lang/String;)Ljava/lang/Enum$EnumDesc;' &&
          dynamic.descriptor === 'Ljava/lang/Enum$EnumDesc;' &&
          arguments_.length === 2;
        if (classDesc || enumDesc) {
          const args = arguments_.map((arg) => bootstrapConstant(cls, arg, visiting));
          if (
            enumDesc &&
            (args[0]?.kind !== 'invoke' ||
              args[0].owner !== 'java/lang/constant/ClassDesc' ||
              args[1]?.kind !== 'const' ||
              args[1].ctype !== 'string')
          )
            throw new ConstantResolutionError(
              'Invalid EnumDesc factory arguments',
              'INVALID_BOOTSTRAP',
            );
          return {
            kind: 'invoke',
            mode: 'static',
            owner: ref.owner,
            name: ref.name,
            descriptor: ref.descriptor,
            args: ctx ? arguments_.map((arg) => bootstrapConstant(cls, arg, visiting, ctx)) : args,
          };
        }
      }
    }
    for (const arg of bootstrap.args)
      if (arg.kind === 'dynamic') dynamicConstant(cls, arg.index, visiting);
    throw new ConstantResolutionError(
      `Unsupported dynamic constant ${dynamic.name}:${dynamic.descriptor} at cp[${index}]: ${bootstrap.ref.ref.owner}.${bootstrap.ref.ref.name}${bootstrap.ref.ref.descriptor}`,
    );
  } finally {
    visiting.delete(index);
  }
}

export function cachedDynamicConstant(
  ctx: Ctx,
  cls: ClassFile,
  index: number,
  visiting = new Set<number>(),
): Expr {
  let entries = ctx.dynamicConstants.get(cls);
  if (!entries) ctx.dynamicConstants.set(cls, (entries = new Map()));
  let entry = entries.get(index);
  if (!entry) {
    const expr = dynamicConstant(cls, index, visiting, ctx);
    if (expr.kind === 'const' || expr.kind === 'class-literal') return expr;
    if (cls.enclosing)
      throw new ConstantResolutionError(
        'Dynamic constant caching in local/anonymous classes is not yet reconstructed',
      );
    const type = parseFieldDescriptor(cls.cp.dynamic(index, 'constant').descriptor);
    let name = `$jsd$condy$${index}`;
    const used = new Set([
      ...cls.methods.map((m) => m.name),
      ...cls.fields.map((f) => f.name),
      ...cls.innerClasses.map((c) => c.innerName),
    ]);
    while (used.has(name) || used.has(name + '$State')) name += '$';
    entry = { name, expr, type };
    entries.set(index, entry);
  }
  return {
    kind: 'invoke',
    mode: 'static',
    owner: cls.name,
    name: entry.name,
    descriptor: '()' + cls.cp.dynamic(index, 'constant').descriptor,
    args: [],
  };
}
