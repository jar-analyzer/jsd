import { annotatedType } from './type-annotations.js';
import { uniqueName } from './printer/context.js';
import { Expr, Stmt } from '../ast/ast.js';
import type { ClassFile, MemberRef, MethodHandleRef, MethodInfo } from '../classfile/model.js';
import {
  parseClassSignature,
  parseMethodDescriptor,
  parseSignature,
  type JType,
} from '../classfile/types.js';
import type { Ctx } from './context.js';
import { decompileMethod } from './method.js';
import { RenderCtx, exprStr, typeStr } from './printer/index.js';

export function resolveLambda(e: Expr, rc: RenderCtx): string | null {
  if (e.kind !== 'invoke' || !e.bootstrap?.interfaces?.length) return resolveLambdaBody(e, rc);
  const body = resolveLambdaBody({ ...e, erasedLambda: true }, rc);
  if (body === null) return null;
  const types = [
    parseMethodDescriptor(e.descriptor).ret,
    ...e.bootstrap.interfaces.map((name) => ({ kind: 'class' as const, name })),
  ];
  return `(${types.map((t) => typeStr(t, rc)).join(' & ')}) (${body})`;
}

function resolveLambdaBody(e: Expr, rc: RenderCtx): string | null {
  if (e.kind !== 'invoke') return null;
  const marker = e.bootstrap;
  if (!marker) return null;
  const cls = rc.ctx.lookup(rc.className);
  if (!cls) return null;
  const fail = (name?: string): string => {
    rc.ctx.diagnostics.add({
      code: 'LAMBDA_DECOMPILE_FAILED',
      severity: 'error',
      stage: 'render',
      className: cls.name,
      methodName: name ?? marker.name,
      descriptor: e.descriptor,
      message: `Could not reconstruct lambda ${name ?? marker.name ?? ''}`,
    });
    return fallbackLambda(name);
  };
  const bm = cls.bootstrapMethods[marker.index];
  if (!bm) return fail(marker.name);
  const implArg = bm.args.find((a) => a.kind === 'methodHandle');
  if (!implArg || implArg.kind !== 'methodHandle') return fail(marker.name);
  const handle: MethodHandleRef = implArg.handle;
  const ref: MemberRef = handle.ref;
  const captured: Expr[] = e.args ?? [];
  const indyDesc = parseMethodDescriptor(e.descriptor);
  const samName = marker.name ?? 'apply';

  const implementation = rc.ctx
    .lookup(ref.owner)
    ?.methods.find((m) => m.name === ref.name && m.descriptor === ref.descriptor);
  if (
    !ref.name.startsWith('lambda$') ||
    !implementation ||
    !(implementation.synthetic || implementation.access & 0x1000)
  ) {
    if (e.erasedLambda && bm.args[0]?.kind === 'methodType') {
      const instantiated = bm.args[2];
      if ((e.annotatedType || e.typeArguments?.length) && instantiated?.kind === 'methodType') {
        const target = functionalTarget(e, instantiated.descriptor, rc);
        if (target)
          return `(${typeStr(target, rc)}) ${methodRefStr(handle, captured, rc, samName, e)}`;
        return fail(ref.name);
      }
      if (instantiated?.kind === 'methodType')
        return erasedMethodReference(
          handle,
          captured,
          bm.args[0].descriptor,
          instantiated.descriptor,
          rc,
        );
    }
    return methodRefStr(handle, captured, rc, samName, e);
  }

  const ownerCls = rc.ctx.lookup(ref.owner);
  if (!ownerCls) return fail(ref.name);
  const m = ownerCls.methods.find((x) => x.name === ref.name && x.descriptor === ref.descriptor);
  if (!m || !m.code) return fail(ref.name);
  const body = decompileMethod(rc.ctx, ownerCls, m);
  if (!body || body.failed) return fail(ref.name);
  if (e.erasedLambda && m.typeAnnotations?.some((entry) => entry.targetType === 0x16)) {
    const instantiated = bm.args[2];
    const target =
      instantiated?.kind === 'methodType'
        ? functionalTarget(e, instantiated.descriptor, rc)
        : undefined;
    if (!target) return fail(ref.name);
    const source = resolveLambdaBody({ ...e, erasedLambda: false }, rc);
    return source === null ? fail(ref.name) : `(${typeStr(target, rc)}) ${source}`;
  }

  const implDesc = parseMethodDescriptor(ref.descriptor);
  const isStaticImpl = (m.access & 0x0008) !== 0;
  const paramSlots: number[] = [];
  let slot = 0;
  if (!isStaticImpl) paramSlots.push(slot++);
  for (const p of implDesc.params) {
    paramSlots.push(slot);
    slot += p.kind === 'prim' && (p.name === 'long' || p.name === 'double') ? 2 : 1;
  }
  const capturedExprs: Expr[] = [...captured];
  const capturedCount = Math.min(capturedExprs.length, paramSlots.length);
  const lambdaParamCount = paramSlots.length - capturedCount;
  if (lambdaParamCount < 0) return fail(ref.name);

  const subst = new Map<number, Expr>();
  for (let i = 0; i < capturedCount; i++) {
    subst.set(paramSlots[i], capturedExprs[i]);
  }
  const names = new Map<number, string>();
  for (let i = capturedCount; i < paramSlots.length; i++) {
    const pi = i - capturedCount;
    const lvtName = lvtNameFor(m, paramSlots[i]);
    names.set(paramSlots[i], lvtName ?? `${samName === 'test' ? 't' : 'v'}${pi}`);
  }
  const instArg = bm.args.find((a) => a.kind === 'methodType' && a !== bm.args[0]);
  const firstParamIdx = isStaticImpl ? 0 : 1;
  let lambdaParamTypes = implDesc.params.slice(
    firstParamIdx + capturedCount - (isStaticImpl ? 0 : 1),
  );
  if (lambdaParamTypes.length > lambdaParamCount)
    lambdaParamTypes = lambdaParamTypes.slice(0, lambdaParamCount);
  if (instArg && instArg.kind === 'methodType') {
    try {
      const inst = parseMethodDescriptor(instArg.descriptor);
      if (inst.params.length === lambdaParamCount) lambdaParamTypes = inst.params;
    } catch {}
  }

  if (e.erasedLambda && bm.args[0]?.kind === 'methodType') {
    const erased = parseMethodDescriptor(bm.args[0].descriptor).params;
    if (erased.length === lambdaParamCount) {
      for (let i = 0; i < erased.length; i++) {
        const slot = paramSlots[capturedCount + i];
        const actual = lambdaParamTypes[i];
        if (actual && JSON.stringify(actual) !== JSON.stringify(erased[i])) {
          subst.set(slot, {
            kind: 'cast',
            jtype: actual,
            expr: { kind: 'local', slot, name: names.get(slot)!, jtype: erased[i] },
          });
        }
      }
      lambdaParamTypes = erased;
    }
  }

  lambdaParamTypes = lambdaParamTypes.map((type, i) =>
    annotatedType(
      type,
      m.typeAnnotations?.filter((entry) => entry.targetType === 0x16 && entry.index === i),
      rc.ctx,
    ),
  );
  const lastS = body.stmts[body.stmts.length - 1];
  const trimmed =
    body.stmts.length && lastS.kind === 'return' && !(lastS as { expr?: unknown }).expr
      ? body.stmts.slice(0, -1)
      : body.stmts;
  const rewritten = substitute(trimmed, subst, names, rc);
  const exprBody = singleExprBody(rewritten, lambdaParamCount);

  const params: { name: string; jtype?: import('../classfile/types.js').JType }[] = [];
  for (let i = capturedCount; i < paramSlots.length; i++) {
    params.push({
      name: names.get(paramSlots[i])!,
      jtype: lambdaParamTypes[params.length],
    });
  }

  const lam: Expr = {
    kind: 'lambda',
    params,
    body: exprBody === undefined ? rewritten : [],
    exprBody,
  };
  const previousReturnType = rc.returnType;
  rc.returnType = implDesc.ret;
  rc.scopes.push(new Map());
  try {
    paramSlots.slice(capturedCount).forEach((slot, i) => {
      rc.scopes[rc.scopes.length - 1].set(slot, names.get(slot) ?? `v${i}`);
    });
    return exprStr(lam, rc, 1);
  } finally {
    rc.returnType = previousReturnType;
    rc.scopes.pop();
  }
}

function functionalTarget(
  expr: Extract<Expr, { kind: 'invoke' }>,
  descriptor: string,
  rc: RenderCtx,
): import('../classfile/types.js').JType | undefined {
  const target = parseMethodDescriptor(expr.descriptor).ret;
  if (target.kind !== 'class') return undefined;
  const method = parseMethodDescriptor(descriptor);
  const p = method.params;
  const ret = method.ret;
  const name = target.name;
  const iface = rc.ctx.lookup(name);
  if (iface) {
    const parameters = iface.signature ? parseClassSignature(iface.signature).typeParams : [];
    if (!parameters.length) return target;
    const sam = iface.methods.find((method) => method.name === expr.bootstrap?.name);
    const formal = sam?.signature ? parseSignature(sam.signature) : undefined;
    if (formal && !('kind' in formal)) {
      const bindings = new Map<string, JType>();
      const bind = (type: JType, actual: JType): void => {
        if (type.kind === 'typevar') bindings.set(type.name, actual);
        else if (type.kind === 'array' && actual.kind === 'array') bind(type.elem, actual.elem);
        else if (type.kind === 'class' && actual.kind === 'class')
          type.args?.forEach((type, i) => {
            if (actual.args?.[i]) bind(type, actual.args[i]);
          });
      };
      formal.params.forEach((type, i) => {
        if (p[i]) bind(type, p[i]);
      });
      bind(formal.ret, ret);
      const args = parameters.map((parameter) => bindings.get(parameter.name));
      if (args.every((type): type is JType => !!type)) return { ...target, args };
    }
  }
  const argumentsByName: Record<string, import('../classfile/types.js').JType[]> = {
    'java/util/function/Function': [...p, ret],
    'java/util/function/BiFunction': [...p, ret],
    'java/util/function/Consumer': p,
    'java/util/function/BiConsumer': p,
    'java/util/function/Predicate': p,
    'java/util/function/BiPredicate': p,
    'java/util/function/Supplier': [ret],
    'java/util/function/UnaryOperator': [ret],
    'java/util/function/BinaryOperator': [ret],
    'java/util/concurrent/Callable': [ret],
  };
  const args = argumentsByName[name];
  if (!args) return undefined;
  return {
    ...target,
    args: args.map((type) => {
      const boxed: Record<string, string> = {
        boolean: 'Boolean',
        byte: 'Byte',
        short: 'Short',
        char: 'Character',
        int: 'Integer',
        long: 'Long',
        float: 'Float',
        double: 'Double',
      };
      return type.kind === 'prim' && boxed[type.name]
        ? { kind: 'class', name: 'java/lang/' + boxed[type.name] }
        : type;
    }),
  };
}

function fallbackLambda(name?: string): string {
  return `/* ${name ?? 'lambda'} */ () -> { throw new UnsupportedOperationException("lambda decompilation failed"); }`;
}

function methodRefStr(
  handle: MethodHandleRef,
  captured: Expr[],
  rc: RenderCtx,
  _samName: string,
  expression?: Expr,
): string | null {
  const ref = handle.ref;
  const ownerDisplay = (internal: string): string => {
    if (expression?.annotatedType) return typeStr(expression.annotatedType, rc);
    rc.refs.add(internal);
    return rc.nameResolver
      ? rc.nameResolver(internal)
      : internal.replace(/\//g, '.').replace(/\$/g, '.');
  };
  const typeArgs = expression?.typeArguments?.length
    ? `<${expression.typeArguments.map((type) => typeStr(type, rc)).join(', ')}>`
    : '';
  switch (handle.kind) {
    case 6:
      return `${ownerDisplay(ref.owner)}::${typeArgs}${ref.name}`;
    case 9:
    case 5: {
      if (
        captured.length === 1 &&
        refDescriptorParamCount(ref.descriptor) === methodTypeOf(ref.descriptor) - 1 + 1
      ) {
      }
      if (captured.length === 1 && receiverMatches(handle, captured)) {
        return `${exprStr(captured[0], rc, 1)}::${typeArgs}${ref.name}`;
      }
      return `${ownerDisplay(ref.owner)}::${typeArgs}${ref.name}`;
    }
    case 7:
      if (ref.owner === rc.className)
        return `${exprStr(captured[0] ?? { kind: 'this' }, rc, 1)}::${typeArgs}${ref.name}`;
      return `${rc.ctx.lookup(ref.owner)?.access && rc.ctx.lookup(ref.owner)!.access & 0x0200 ? ownerDisplay(ref.owner) + '.' : ''}super::${typeArgs}${ref.name}`;
    case 8: {
      return `${ownerDisplay(ref.owner)}::${typeArgs}new`;
    }
    default:
      return `${ownerDisplay(ref.owner)}::${typeArgs}${ref.name}`;
  }
}

function erasedMethodReference(
  handle: MethodHandleRef,
  captured: Expr[],
  samDescriptor: string,
  instantiatedDescriptor: string,
  rc: RenderCtx,
): string {
  const erased = parseMethodDescriptor(samDescriptor);
  const instantiated = parseMethodDescriptor(instantiatedDescriptor);
  const scope = new Map<number, string>();
  rc.scopes.push(scope);
  try {
    const params = erased.params.map((jtype, i) => {
      const slot = -10000 - i;
      const name = uniqueName(rc, `lambdaArg${i}`);
      scope.set(slot, name);
      return { name, jtype, slot };
    });
    const values: Expr[] = params.map((p, i) => {
      const local: Expr = { kind: 'local', slot: p.slot, name: p.name, jtype: p.jtype };
      const actual = instantiated.params[i];
      return actual && JSON.stringify(actual) !== JSON.stringify(p.jtype)
        ? { kind: 'cast', jtype: actual, expr: local }
        : local;
    });
    const ref = handle.ref;
    let body: Expr;
    if (handle.kind === 8)
      body = {
        kind: 'new',
        owner: ref.owner,
        descriptor: ref.descriptor,
        args: [...captured, ...values],
      };
    else if (handle.kind === 6)
      body = { kind: 'invoke', mode: 'static', ...ref, args: [...captured, ...values] };
    else {
      const target = captured[0] ?? values.shift();
      body = {
        kind: 'invoke',
        mode: handle.kind === 9 ? 'interface' : 'virtual',
        ...ref,
        target,
        args: [...captured.slice(1), ...values],
        superCall: handle.kind === 7 && ref.owner !== rc.className,
      };
    }
    return exprStr({ kind: 'lambda', params, body: [], exprBody: body }, rc, 1);
  } finally {
    rc.scopes.pop();
  }
}

function receiverMatches(handle: MethodHandleRef, captured: Expr[]): boolean {
  return handle.kind === 5 || handle.kind === 9 ? captured.length === 1 : false;
}

function refDescriptorParamCount(desc: string): number {
  try {
    return parseMethodDescriptor(desc).params.length;
  } catch {
    return 0;
  }
}
function methodTypeOf(desc: string): number {
  return refDescriptorParamCount(desc) + 1;
}

function lvtNameFor(m: MethodInfo, slot: number): string | null {
  for (const e of m.code?.localVars ?? []) {
    if (e.index === slot) return e.name;
  }
  return null;
}

function substitute(
  stmts: Stmt[],
  subst: Map<number, Expr>,
  names: Map<number, string>,
  rc: RenderCtx,
): Stmt[] {
  const subE = (e: Expr): Expr => {
    if (!e || typeof e !== 'object') return e;
    if (e.kind === 'local' && subst.has(e.slot)) {
      return subst.get(e.slot)!;
    }
    if (e.kind === 'this' && subst.has(0)) {
      return subst.get(0)!;
    }
    switch (e.kind) {
      case 'binary':
        e.left = subE(e.left);
        e.right = subE(e.right);
        return e;
      case 'unary':
        e.operand = subE(e.operand);
        return e;
      case 'cast':
        e.expr = subE(e.expr);
        return e;
      case 'instanceof':
        e.expr = subE(e.expr);
        return e;
      case 'invoke':
        if (e.target) e.target = subE(e.target);
        e.args = e.args.map(subE);
        return e;
      case 'new':
        e.args = e.args.map(subE);
        if (e.outer) e.outer = subE(e.outer);
        return e;
      case 'new-array':
        e.dimsExprs = e.dimsExprs.map(subE);
        return e;
      case 'array-init':
        e.values = e.values.map(subE);
        return e;
      case 'array-length':
        e.array = subE(e.array);
        return e;
      case 'array-load':
        e.array = subE(e.array);
        e.index = subE(e.index);
        return e;
      case 'field-get':
        if (e.target) e.target = subE(e.target);
        return e;
      case 'ternary':
        e.cond = subE(e.cond);
        e.thenE = subE(e.thenE);
        e.elseE = subE(e.elseE);
        return e;
      case 'bool':
        e.inner = subE(e.inner);
        return e;
      case 'assign-expr':
        e.expr = subE(e.expr);
        return e;
      case 'concat':
        e.parts = e.parts.map(subE);
        return e;
      case 'sb-chain':
        e.parts = e.parts.map(subE);
        return e;
      default:
        return e;
    }
  };
  const rename = (slot: number): string | undefined => names.get(slot);
  const subS = (s: Stmt): Stmt => {
    switch (s.kind) {
      case 'expr':
        s.expr = subE(s.expr);
        break;
      case 'if':
        s.cond = subE(s.cond);
        s.thenS.forEach(subS);
        s.elseS?.forEach(subS);
        break;
      case 'while':
        if (s.cond) s.cond = subE(s.cond);
        s.body.forEach(subS);
        break;
      case 'do-while':
        s.cond = subE(s.cond);
        s.body.forEach(subS);
        break;
      case 'for':
        s.init.forEach(subS);
        s.update.forEach(subS);
        if (s.cond) s.cond = subE(s.cond);
        s.body.forEach(subS);
        break;
      case 'foreach':
        s.iterable = subE(s.iterable);
        s.body.forEach(subS);
        break;
      case 'switch':
        s.subject = subE(s.subject);
        s.cases.forEach((c) => c.body.forEach(subS));
        break;
      case 'return':
        if (s.expr) s.expr = subE(s.expr);
        break;
      case 'throw':
        s.expr = subE(s.expr);
        break;
      case 'assert':
        s.cond = subE(s.cond);
        if (s.msg) s.msg = subE(s.msg);
        break;
      case 'sync':
        s.monitor = subE(s.monitor);
        s.body.forEach(subS);
        break;
      case 'local-decl':
        if (s.init) s.init = subE(s.init);
        break;
      default:
        break;
    }
    return s;
  };
  const out = stmts.map(subS);
  for (const [slot, name] of names) {
    if (!rc.slotNames.has(slot)) rc.slotNames.set(slot, name);
  }
  void rename;
  return out;
}

function singleExprBody(stmts: Stmt[], expectedParams: number): Expr | undefined {
  if (expectedParams === 0 && stmts.length === 0) return undefined;
  if (stmts.length === 1 && stmts[0].kind === 'return' && stmts[0].expr) {
    return stmts[0].expr;
  }
  if (stmts.length === 1 && stmts[0].kind === 'expr') {
    return undefined;
  }
  return undefined;
}

export function findLambdaOwner(
  cls: ClassFile,
  name: string,
  desc: string,
): MethodInfo | undefined {
  return cls.methods.find((m) => m.name === name && m.descriptor === desc);
}
