import { isAnonymousClass } from '../classfile/names.js';
import { walkExpr, walkStmt, walkStmtExprs, type Expr, type Stmt } from '../ast/ast.js';
import { expressionType } from '../ast/types.js';
import type { Instr } from '../bytecode/decode.js';
import type { ClassFile, MethodInfo, TypeAnnotation } from '../classfile/model.js';
import { parseMethodDescriptor, parseSignature, type JType } from '../classfile/types.js';
import type { Ctx } from './context.js';
import { annotatedType, hasTypeAnnotations } from './type-annotations.js';
import { DecompileLimitError } from './budget.js';

export function applyCodeTypeAnnotations(
  ctx: Ctx,
  cls: ClassFile,
  method: MethodInfo,
  stmts: Stmt[],
  instructions: Instr[],
): void {
  const annotations = method.code?.typeAnnotations;
  if (!annotations?.length) return;
  const expressions = new Set<Expr>();
  const statements = new Set<Stmt>();
  for (const stmt of stmts) {
    walkStmtExprs(stmt, (expr) => expressions.add(expr));
    walkStmt(stmt, (child) => statements.add(child));
  }
  const ordered = [...expressions].sort(
    (a, b) => (a.bytecodeOffset ?? -1) - (b.bytecodeOffset ?? -1),
  );
  const instructionAt = new Map(instructions.map((instruction) => [instruction.pc, instruction]));
  for (const entry of annotations) {
    try {
      ctx.budget.check(expressions.size + instructions.length);
      let applied = false;
      if (entry.table) {
        for (const range of new Map(
          entry.table.map((range) => [`${range.start}:${range.length}:${range.index}`, range]),
        ).values()) {
          ctx.budget.check(expressions.size + instructions.length + statements.size);
          const accesses = instructions.filter(
            (ins) =>
              ins.originalLocal === range.index &&
              ins.pc + ins.size >= range.start &&
              ins.pc < range.start + range.length,
          );
          const slots = new Set(accesses.map((ins) => ins.local));
          const annotate = (type: JType): JType => {
            const local = method.code?.localVarTypes.find(
              (lv) => lv.index === range.index && lv.start === range.start,
            );
            if (local && !hasTypeAnnotations(type)) {
              const parsed = parseSignature(local.descriptor);
              if ('kind' in parsed) type = parsed;
            }
            applied = true;
            return annotatedType(type, [entry], ctx);
          };
          for (const expr of expressions) {
            if (
              expr.kind !== 'assign-expr' ||
              expr.target.kind !== 'local' ||
              !slots.has(expr.target.slot)
            )
              continue;
            const ins = accesses.find((ins) => ins.pc === expr.bytecodeOffset);
            if (!ins) continue;
            const type =
              expr.target.jtype ??
              expressionType(expr.expr) ??
              ctx.slotInferredType(method, expr.target.slot);
            if (type) expr.target.jtype = annotate(type);
          }
          for (const stmt of statements) {
            if (stmt.kind === 'try')
              for (const resource of stmt.resources ?? []) {
                if (slots.has(resource.slot)) resource.jtype = annotate(resource.jtype);
              }
            if (stmt.kind === 'foreach' && slots.has(stmt.varSlot))
              stmt.varJType = annotate(stmt.varJType);
            if (stmt.kind === 'local-decl' && slots.has(stmt.slot))
              stmt.jtype = annotate(stmt.jtype);
          }
        }
      } else if (entry.targetType === 0x42) {
        const handler = method.code?.exceptions[entry.index!];
        for (const stmt of statements)
          if (stmt.kind === 'try') {
            for (const caught of stmt.catches) {
              if (!handler || caught.handlerPc !== handler.handlerPc) continue;
              const names = [
                caught.type,
                ...((caught as { extraTypes?: string[] }).extraTypes ?? []),
              ].filter((name): name is string => !!name);
              caught.annotatedTypes ??= names.map((name) => ({ kind: 'class', name }));
              const index = names.indexOf(handler.catchType!);
              if (index < 0) continue;
              caught.annotatedTypes[index] = annotatedType(
                caught.annotatedTypes[index],
                [entry],
                ctx,
              );
              applied = true;
            }
          }
      } else {
        let expr = ordered.find(
          (expr) =>
            expr.bytecodeOffset === entry.offset &&
            (entry.targetType === 0x43
              ? expr.kind === 'instanceof'
              : entry.targetType === 0x44
                ? ['new', 'new-array', 'array-init'].includes(expr.kind)
                : entry.targetType === 0x47
                  ? expr.kind === 'cast'
                  : entry.targetType === 0x48
                    ? expr.kind === 'new' || expr.kind === 'invoke'
                    : expr.kind === 'invoke' || expr.kind === 'method-ref'),
        );
        if (!expr && [0x43, 0x47, 0x49].includes(entry.targetType)) {
          expr = [...ordered].reverse().find((candidate) => {
            if (
              entry.targetType === 0x43
                ? candidate.kind !== 'instanceof'
                : entry.targetType === 0x47
                  ? candidate.kind !== 'cast'
                  : candidate.kind !== 'invoke' || !!candidate.bootstrap
            )
              return false;
            let start = candidate.bytecodeOffset ?? Infinity;
            walkExpr(candidate, (child) => {
              start = Math.min(start, child.bytecodeOffset ?? Infinity);
            });
            return start === entry.offset;
          });
        }
        if (!expr && entry.targetType === 0x44)
          expr = ordered.find(
            (expr) =>
              (expr.bytecodeOffset ?? -1) >= entry.offset! &&
              ['new-array', 'array-init'].includes(expr.kind),
          );
        if (!expr && entry.targetType === 0x47 && entry.typeArgumentIndex === 0) {
          const candidate = ordered.find(
            (expr) =>
              expr.bytecodeOffset !== undefined &&
              (expr.bytecodeOffset === entry.offset ||
                expr.bytecodeOffset + (instructionAt.get(expr.bytecodeOffset)?.size ?? 0) ===
                  entry.offset) &&
              !['assign-expr', 'instanceof'].includes(expr.kind),
          );
          if (candidate) {
            const original = structuredClone(candidate);
            const type = expressionType(original) ?? parseMethodDescriptor(method.descriptor).ret;
            Object.assign(candidate, {
              kind: 'cast',
              jtype: type,
              expr: original,
              bytecodeOffset: entry.offset,
            });
            expr = candidate;
          }
        }
        if (!expr && entry.targetType >= 0x48) {
          const cast = ordered.find(
            (expr) => expr.bytecodeOffset === entry.offset && expr.kind === 'cast',
          );
          if (cast?.kind === 'cast' && cast.expr.kind === 'invoke') expr = cast.expr;
          expr ??= ordered.find(
            (expr) =>
              (expr.kind === 'invoke' || expr.kind === 'new') &&
              expr.bytecodeOffset !== undefined &&
              expr.bytecodeOffset + (instructionAt.get(expr.bytecodeOffset)?.size ?? 0) ===
                entry.offset,
          );
        }
        if (expr) {
          if (expr.kind === 'cast') {
            if (entry.typeArgumentIndex !== 0 || expr.intersectionTypes) {
              if (!expr.intersectionTypes) {
                expr.intersectionTypes = [];
                let operand: Expr = expr;
                while (operand.kind === 'cast') {
                  expr.intersectionTypes.push(operand.jtype);
                  operand = operand.expr;
                }
              }
              const index = entry.typeArgumentIndex!;
              if (!expr.intersectionTypes[index])
                throw new Error('Intersection cast type could not be recovered');
              expr.intersectionTypes[index] = annotatedType(
                expr.intersectionTypes[index],
                [entry],
                ctx,
              );
            } else expr.jtype = annotatedType(expr.jtype, [entry], ctx);
          } else if (expr.kind === 'instanceof')
            expr.checkType = annotatedType(expr.checkType, [entry], ctx);
          else if (entry.targetType === 0x44) {
            let type: JType;
            let typeEntry = entry;
            if (expr.kind === 'new') {
              const allocated = ctx.lookup(expr.owner);
              type = {
                kind: 'class',
                name:
                  allocated && isAnonymousClass(allocated)
                    ? (allocated.interfaces[0] ?? allocated.superName ?? expr.owner)
                    : expr.owner,
              };
              if (allocated && isAnonymousClass(allocated)) {
                const key = (value: unknown) =>
                  JSON.stringify(value, (_, value) =>
                    typeof value === 'bigint' ? `${value}n` : value,
                  );
                typeEntry =
                  allocated.typeAnnotations?.find(
                    (candidate) =>
                      candidate.targetType === 0x10 &&
                      key(candidate.annotation) === key(entry.annotation),
                  ) ?? entry;
              }
            } else if (expr.kind === 'new-array') {
              type = expr.elemType;
              for (let i = 0; i < expr.dims; i++) type = { kind: 'array', elem: type };
            } else if (expr.kind === 'array-init') type = { kind: 'array', elem: expr.elemType };
            else throw new Error('Missing allocation type');
            expr.annotatedType = annotatedType(expr.annotatedType ?? type, [typeEntry], ctx);
          } else if (
            (entry.targetType === 0x45 || entry.targetType === 0x46) &&
            expr.kind === 'invoke' &&
            expr.bootstrap
          ) {
            const handle = cls.bootstrapMethods[expr.bootstrap.index]?.args.find(
              (arg) => arg.kind === 'methodHandle',
            );
            if (handle?.kind !== 'methodHandle') throw new Error('Missing method reference type');
            expr.annotatedType = annotatedType(
              expr.annotatedType ?? { kind: 'class', name: handle.handle.ref.owner },
              [entry],
              ctx,
            );
          } else if (entry.targetType >= 0x48) {
            expr.typeArguments = recoverTypeArguments(ctx, cls, expr, entry);
          } else throw new Error('Missing annotated expression');
          applied = true;
        }
      }
      if (!applied) throw new Error('Annotated source location could not be recovered');
    } catch (error) {
      if (error instanceof DecompileLimitError) throw error;
      ctx.diagnostics.add({
        code: 'UNSUPPORTED_TYPE_ANNOTATIONS',
        severity: 'warning',
        stage: 'render',
        className: cls.name,
        methodName: method.name,
        descriptor: method.descriptor,
        bytecodeOffset: entry.offset,
        message: `Type annotation ${entry.annotation.typeName}: ${(error as Error).message}`,
      });
    }
  }
}

function recoverTypeArguments(
  ctx: Ctx,
  cls: ClassFile,
  expr: Expr,
  entry: TypeAnnotation,
): JType[] {
  if (expr.kind !== 'new' && expr.kind !== 'invoke' && expr.kind !== 'method-ref')
    throw new Error('Missing generic invocation');
  let owner = expr.owner,
    name = expr.kind === 'new' ? '<init>' : expr.name,
    descriptor = expr.descriptor;
  let args = 'args' in expr ? expr.args : [];
  if (expr.kind === 'invoke' && expr.bootstrap) {
    const handle = cls.bootstrapMethods[expr.bootstrap.index]?.args.find(
      (arg) => arg.kind === 'methodHandle',
    );
    if (handle?.kind !== 'methodHandle') throw new Error('Missing method reference');
    ({ owner, name, descriptor } = handle.handle.ref);
    const instantiated = cls.bootstrapMethods[expr.bootstrap.index].args[2];
    if (instantiated?.kind === 'methodType') {
      const signature = parseSignature(instantiated.descriptor);
      if (!('kind' in signature))
        args = signature.params.map((jtype) => ({ kind: 'raw', text: '', jtype }));
    }
  }
  const method = descriptor ? ctx.methodInfo(owner, name, descriptor)?.m : undefined;
  if (!method?.signature) throw new Error('Generic invocation signature is unavailable');
  const signature = parseSignature(method.signature);
  if ('kind' in signature) throw new Error('Missing generic method signature');
  const inferred = new Map<string, JType>();
  const bind = (formal: JType, actual: JType): void => {
    if (formal.kind === 'typevar') inferred.set(formal.name, actual);
    else if (formal.kind === 'array' && actual.kind === 'array') bind(formal.elem, actual.elem);
    else if (formal.kind === 'class' && actual.kind === 'class')
      formal.args?.forEach((arg, i) => {
        if (actual.args?.[i]) bind(arg, actual.args[i]);
      });
  };
  signature.params.forEach((formal, i) => {
    const actual = args[i] && expressionType(args[i]);
    if (actual) bind(formal, actual);
  });
  const types =
    expr.typeArguments ??
    signature.typeParams.map((param) => {
      const type = inferred.get(param.name);
      if (!type) throw new Error('Erased type argument could not be inferred');
      return type;
    });
  const index = entry.typeArgumentIndex!;
  if (!types[index]) throw new Error('Invalid type argument index');
  types[index] = annotatedType(types[index], [entry], ctx);
  return types;
}
