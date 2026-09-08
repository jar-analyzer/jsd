import { prepareExpression } from '../java/expressions.js';
import { expressionType } from '../../ast/types.js';
import { initialType } from '../java/types.js';
import { javaLiteral } from './literals.js';
import { AssignTarget, Expr, walkExpr } from '../../ast/ast.js';
import { parseMethodDescriptor, type JType } from '../../classfile/types.js';
import {
  PREC,
  RenderCtx,
  binPrec,
  lookupDeclared,
  renderBlock,
  resolve,
  resolveAccessor,
  outerOf,
} from './context.js';
import { typeStr, nestedDisplay, simpleOf } from './types.js';

export { escapeString } from './literals.js';

export function exprStr(e: Expr, rc: RenderCtx, prec = 0, valueRequired = true): string {
  const prepared = prepareExpression(e, rc.ctx);
  let [s, p] = exprPrec(prepared, rc);
  if (valueRequired && prepared.kind === 'invoke' && prepared.eraseResult) {
    s = `(${typeStr(parseMethodDescriptor(prepared.descriptor).ret, rc)}) (${s})`;
    p = PREC.cast;
  }
  return p < prec ? `(${s})` : s;
}

function exprPrec(e: Expr, rc: RenderCtx): [string, number] {
  switch (e.kind) {
    case 'this':
      return ['this', PREC.postfix];
    case 'super':
      return ['super', PREC.postfix];
    case 'outer-this':
      return [`${resolve(e.owner, rc)}.this`, PREC.postfix];
    case 'local': {
      const name = lookupDeclared(rc, e.slot) ?? e.name;
      return [name, PREC.postfix];
    }
    case 'const': {
      const literal = javaLiteral(e.ctype, e.value);
      return [literal, literal.startsWith('-') ? PREC.unary : PREC.postfix];
    }
    case 'class-literal':
      return [`${typeStr(e.jtype, rc)}.class`, PREC.postfix];
    case 'binary': {
      const p = binPrec(e.op);
      const l = exprStr(e.left, rc, p);
      const r = exprStr(e.right, rc, p + 1);
      return [`${l} ${e.op} ${r}`, p];
    }
    case 'unary': {
      switch (e.op) {
        case 'x++':
          return [`${exprStr(e.operand, rc, PREC.postfix)}++`, PREC.postfix];
        case 'x--':
          return [`${exprStr(e.operand, rc, PREC.postfix)}--`, PREC.postfix];
        case '++x':
          return [`++${exprStr(e.operand, rc, PREC.unary)}`, PREC.unary];
        case '--x':
          return [`--${exprStr(e.operand, rc, PREC.unary)}`, PREC.unary];
        case '!':
          return [`!${exprStr(e.operand, rc, PREC.unary)}`, PREC.unary];
        case '~':
          return [`~${exprStr(e.operand, rc, PREC.unary)}`, PREC.unary];
        case '-':
        case '+':
          return [`${e.op}${exprStr(e.operand, rc, PREC.unary + 1)}`, PREC.unary];
      }
      return ['~' + exprStr((e as { operand: Expr }).operand, rc, PREC.unary), PREC.unary];
    }
    case 'cast': {
      const t = typeStr(e.jtype, rc);
      const inner = exprStr(e.expr, rc, PREC.unary);
      return [`(${t}) ${inner}`, PREC.cast];
    }
    case 'instanceof': {
      const l = exprStr(e.expr, rc, PREC.rel);
      const t = typeStr(e.checkType, rc);
      const bind = e.bindName ? ` ${e.bindName}` : '';
      return [`${l} instanceof ${t}${bind}`, PREC.rel];
    }
    case 'invoke': {
      if (rc.lambdaResolver) {
        const lam = rc.lambdaResolver(e);
        if (lam !== null) return [lam, PREC.lambda];
      }
      const args = e.args.map((a) => exprStr(a, rc, PREC.lambda)).join(', ');
      if (e.mode === 'static') {
        const acc = resolveAccessor(rc, e.owner, e.name);
        if (acc) {
          const tgt = e.args[0] ? exprStr(e.args[0], rc, PREC.postfix) : '?';
          if (acc.kind === 'get') return [`${tgt}.${acc.field}`, PREC.postfix];
          const val = e.args[1] ? exprStr(e.args[1], rc, PREC.assign) : '?';
          return [`${tgt}.${acc.field} = ${val}`, PREC.assign];
        }
        if (e.owner === rc.className) return [`${e.name}(${args})`, PREC.postfix];
        return [`${resolve(e.owner, rc)}.${e.name}(${args})`, PREC.postfix];
      }
      if (e.superCall) {
        if (e.name === '<init>') return [`super(${args})`, PREC.postfix];
        if (e.owner !== rc.className && !isClassSuper(e.owner, rc)) {
          return [`${resolve(e.owner, rc)}.super.${e.name}(${args})`, PREC.postfix];
        }
        return [`super.${e.name}(${args})`, PREC.postfix];
      }
      if (e.name === '<init>') return [`this(${args})`, PREC.postfix];
      if (e.target) {
        if (e.target.kind === 'this' && e.owner === rc.className) {
          return [`${e.name}(${args})`, PREC.postfix];
        }
        const ts = exprStr(e.target, rc, PREC.postfix);
        return [`${ts}.${e.name}(${args})`, PREC.postfix];
      }
      return [`${e.name}(${args})`, PREC.postfix];
    }
    case 'new': {
      const anon = rc.anonClasses?.get(e.owner);
      if (anon) {
        const superDisplay = resolve(anon.superInternal, rc);
        const args = (anon.superArgIndices ?? []).map((index) =>
          exprStr(e.args[index], rc, PREC.lambda),
        );
        const captureValues = new Map<string, Expr>();
        for (const capture of anon.captureFields ?? []) {
          const value = structuredClone(e.args[capture.index]);
          if (!value) throw new Error('Missing anonymous capture argument');
          walkExpr(value, (expr) => {
            if (expr.kind === 'this')
              Object.assign(expr, { kind: 'outer-this', owner: rc.className });
          });
          captureValues.set(e.owner + '#' + capture.name, {
            kind: 'raw',
            text: exprStr(value, rc, PREC.postfix),
            jtype: capture.type,
          });
        }
        const bodyLines = anon.renderMembers(captureValues);
        const body = bodyLines.map((l) => (l ? '    ' + l : l)).join('\n');
        return [`new ${superDisplay}(${args.join(', ')}) {\n${body}\n}`, PREC.postfix - 2];
      }
      const local = rc.localClasses?.get(e.owner);
      if (local) {
        let args = e.args.map((a) => exprStr(a, rc, PREC.lambda));
        if (local.dropFirstArg && args.length > 0) args = args.slice(1);
        const qualified = e.outer ? `${exprStr(e.outer, rc, PREC.postfix)}.` : '';
        return [`${qualified}new ${local.simpleName}(${args.join(', ')})`, PREC.postfix - 1];
      }
      const innerCtor = innerClassCtorInfo(e.owner, rc);
      if (innerCtor) {
        const first = e.args[0];
        let args = e.args.map((a) => exprStr(a, rc, PREC.lambda));
        let prefix = '';
        if (args.length > 0 && innerCtor.dropFirst) {
          args = args.slice(1);
          if (first && first.kind !== 'this') {
            prefix = `${exprStr(first, rc, PREC.postfix)}.`;
          }
        }
        return [`${prefix}new ${innerCtor.simpleName}(${args.join(', ')})`, PREC.postfix - 1];
      }
      const ownerDisplay = resolve(e.owner, rc);
      const args = e.args.map((a) => exprStr(a, rc, PREC.lambda)).join(', ');
      if (e.outer) {
        const os = exprStr(e.outer, rc, PREC.postfix);
        return [`${os}.new ${simpleOf(ownerDisplay)}(${args})`, PREC.postfix - 1];
      }
      return [`new ${ownerDisplay}(${args})`, PREC.postfix - 1];
    }
    case 'new-array': {
      const elem = typeStr(e.elemType, rc);
      let s = elem;
      for (const d of e.dimsExprs) s += `[${exprStr(d, rc, PREC.lambda)}]`;
      for (let i = e.dimsExprs.length; i < e.dims; i++) s += '[]';
      return [`new ${s}`, PREC.postfix - 1];
    }
    case 'array-init': {
      const elem = typeStr(e.elemType, rc);
      const vals = e.values.map((v) => exprStr(v, rc, PREC.lambda)).join(', ');
      return [`new ${elem}[] { ${vals} }`, PREC.postfix - 1];
    }
    case 'array-length':
      return [`${exprStr(e.array, rc, PREC.postfix)}.length`, PREC.postfix];
    case 'array-load': {
      const arr = exprStr(e.array, rc, PREC.postfix);
      const idx = exprStr(e.index, rc, PREC.lambda);
      return [`${arr}[${idx}]`, PREC.postfix];
    }
    case 'field-get': {
      const captured =
        e.target?.kind === 'this' ? rc.fieldValues?.get(e.owner + '#' + e.name) : undefined;
      if (captured) return [exprStr(captured, rc, PREC.postfix), PREC.postfix];
      const fieldName = e.name;
      if (e.target) {
        if (
          e.name.startsWith('this$') &&
          e.target.kind === 'this' &&
          e.owner === rc.className &&
          rc.ctx
            .lookup(e.owner)
            ?.fields.some((f) => f.name === e.name && (f.synthetic || f.access & 0x1000))
        ) {
          const outer = outerOf(rc, e.owner);
          if (outer) return [`${resolve(outer, rc)}.this`, PREC.postfix];
        }
        if (e.target.kind === 'this' && e.owner === rc.className) {
          return [`this.${fieldName}`, PREC.postfix];
        }
        const ts = fieldReceiver(e.target, e.owner, e.name, rc);
        return [`${ts}.${fieldName}`, PREC.postfix];
      }
      if (e.owner === rc.className) return [fieldName, PREC.postfix];
      return [`${resolve(e.owner, rc)}.${fieldName}`, PREC.postfix];
    }
    case 'ternary': {
      const c = exprStr(e.cond, rc, PREC.ternary + 1);
      const t = exprStr(e.thenE, rc, PREC.ternary);
      const f = exprStr(e.elseE, rc, PREC.ternary);
      return [`${c} ? ${t} : ${f}`, PREC.ternary];
    }
    case 'bool':
      return [exprStr(e.inner, rc, PREC.postfix), PREC.postfix];
    case 'assign-expr': {
      const target = assignTargetStr(e.target, rc);
      if (e.op) {
        const ex = e.expr;
        if (
          ex.kind === 'binary' &&
          ex.op === e.op &&
          ((ex.left.kind === 'local' &&
            e.target.kind === 'local' &&
            ex.left.slot === (e.target as { slot: number }).slot) ||
            (ex.left.kind === 'this' &&
              e.target.kind === 'field' &&
              (e.target as { target?: Expr }).target?.kind === 'this'))
        ) {
          return [`${target} ${e.op}= ${exprStr(ex.right, rc, PREC.lambda)}`, PREC.assign];
        }
        return [`${target} ${e.op}= ${exprStr(ex, rc, PREC.lambda)}`, PREC.assign];
      }
      const val = exprStr(e.expr, rc, PREC.lambda);
      return [`${target} = ${val}`, PREC.assign];
    }
    case 'concat': {
      let s = '';
      let first = true;
      for (let i = 0; i < e.parts.length; i++) {
        const p = e.parts[i];
        const ps = exprStr(p, rc, first ? PREC.add : PREC.add + 1);
        s = first ? ps : `${s} + ${ps}`;
        first = false;
      }
      return [s, PREC.add];
    }
    case 'lambda': {
      const head =
        e.params.length === 1 && !e.params[0].jtype
          ? e.params[0].name
          : `(${e.params.map((p) => (p.jtype ? `${typeStr(p.jtype, rc)} ${p.name}` : p.name)).join(', ')})`;
      if (e.exprBody !== undefined) {
        return [`${head} -> ${exprStr(e.exprBody, rc, PREC.lambda)}`, PREC.lambda];
      }
      const body = renderBlock(e.body, rc, 0).join(' ');
      return [`${head} -> { ${body} }`, PREC.lambda];
    }
    case 'method-ref': {
      if (e.isNew) {
        return [`${resolve(e.owner, rc)}::new`, PREC.lambda];
      }
      if (e.target) {
        return [`${exprStr(e.target, rc, PREC.postfix)}::${e.name}`, PREC.lambda];
      }
      return [`${resolve(e.owner, rc)}::${e.name}`, PREC.lambda];
    }
    case 'monitor':
      return [`/* monitor(${exprStr(e.expr, rc, PREC.lambda)}) */`, PREC.postfix];
    case 'raw':
      return [e.text, PREC.postfix];
    case 'sb-chain': {
      const owner = e.jtype?.kind === 'class' ? resolve(e.jtype.name, rc) : 'StringBuilder';
      let s = `new ${owner}()`;
      for (const p of e.parts) s += `.append(${exprStr(p, rc, PREC.lambda)})`;
      return [s, PREC.postfix - 1];
    }
    case 'new-uninit':
      return [`/* new ${e.owner} */`, PREC.postfix];
  }
}

function isClassSuper(owner: string, rc: RenderCtx): boolean {
  const cf = rc.ctx.lookup(rc.className);
  return cf?.superName === owner;
}

export function inferInitType(e: Expr, rc?: RenderCtx): JType | undefined {
  return initialType(e, rc?.ctx);
}

function innerClassCtorInfo(
  owner: string,
  rc: RenderCtx,
): { simpleName: string; dropFirst: boolean } | null {
  const cf = rc.ctx.lookup(owner);
  if (!cf) return null;
  const ic = cf.innerClasses.find((x) => x.inner === owner);
  if (!ic?.outer) return null;
  if (ic.access & 0x0008) return null;
  const ctor = cf.methods.find((m) => m.name === '<init>');
  if (!ctor) return null;
  const outerRef =
    cf.fields.some((f) => f.name === 'this$0') || ctor.descriptor.startsWith(`(L${ic.outer}`);
  if (!outerRef) return null;
  return { simpleName: ic.innerName ?? simpleOf(nestedDisplay(owner)), dropFirst: true };
}

function assignTargetStr(t: AssignTarget, rc: RenderCtx): string {
  switch (t.kind) {
    case 'local':
      return lookupDeclared(rc, t.slot) ?? t.name;
    case 'field': {
      const fieldName = t.name;
      if (t.target) {
        if (t.target.kind === 'this' && t.owner === rc.className) return `this.${fieldName}`;
        return `${fieldReceiver(t.target, t.owner, t.name, rc)}.${fieldName}`;
      }
      if (t.owner === rc.className) return fieldName;
      return `${resolve(t.owner, rc)}.${fieldName}`;
    }
    case 'array':
      return `${exprStr(t.array, rc, PREC.postfix)}[${exprStr(t.index, rc, PREC.lambda)}]`;
  }
}

function fieldReceiver(target: Expr, owner: string, name: string, rc: RenderCtx): string {
  const type =
    target.kind === 'this' ? { kind: 'class', name: rc.className } : expressionType(target);
  if (type?.kind === 'class' && type.name !== owner) {
    const seen = new Set<string>();
    let current: string | null | undefined = type.name;
    while (current && current !== owner && !seen.has(current)) {
      seen.add(current);
      const cls = rc.ctx.lookup(current);
      if (!cls || cls.fields.some((f) => f.name === name))
        return exprStr(
          { kind: 'cast', jtype: { kind: 'class', name: owner }, expr: target },
          rc,
          PREC.postfix,
        );
      current = cls.superName;
    }
  }
  return exprStr(target, rc, PREC.postfix);
}
