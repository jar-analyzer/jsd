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
      return dynamicConstant(cls, arg.index, visiting);
    case 'methodHandle':
      throw new ConstantResolutionError(
        `MethodHandle kind ${arg.handle.kind}: ${arg.handle.ref.owner}.${arg.handle.ref.name}${arg.handle.ref.descriptor} requires JVM lookup semantics`,
      );
  }
}

export function dynamicConstant(cls: ClassFile, index: number, visiting = new Set<number>()): Expr {
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
      return { kind: 'field-get', owner: type.name, name: dynamic.name, jtype: type };
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
      // Retain JVM lookup/access checks instead of assuming the field is publicly accessible.
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
            args,
          };
        }
      }
    }
    // Resolve nested arguments only to validate their graph; never execute a bootstrap.
    for (const arg of bootstrap.args)
      if (arg.kind === 'dynamic') dynamicConstant(cls, arg.index, visiting);
    throw new ConstantResolutionError(
      `Unsupported dynamic constant ${dynamic.name}:${dynamic.descriptor} at cp[${index}]: ${bootstrap.ref.ref.owner}.${bootstrap.ref.ref.name}${bootstrap.ref.ref.descriptor}`,
    );
  } finally {
    visiting.delete(index);
  }
}
