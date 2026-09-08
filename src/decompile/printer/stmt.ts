import { prepareLocalAssignment } from '../java/locals.js';
import { prepareReturnValue } from '../java/expressions.js';
import { forInitDeclOutside, forInitStr } from './loops.js';
import { adaptLambdaTarget } from '../calls.js';
import { Stmt } from '../../ast/ast.js';
import {
  PREC,
  RenderCtx,
  declaredNameOf,
  declareSlot,
  renderBlock as renderBlockOuter,
} from './context.js';
import { exprStr, escapeString } from './expr.js';
import { typeStr } from './types.js';

export function renderStmtsHeader(header: string, stmts: Stmt[], rc: RenderCtx): string[] {
  const body = renderStmts(stmts, rc, 1);
  if (body.length === 0) return [header + ' {', '}'];
  return [header + ' {', ...body, '}'];
}

export function renderStmts(stmts: Stmt[], rc: RenderCtx, indent: number): string[] {
  const out: string[] = [];
  for (const s of stmts) out.push(...renderStmt(s, rc, indent));
  return out;
}

export function renderStmt(s: Stmt, rc: RenderCtx, indent: number): string[] {
  const ind = '    '.repeat(indent);
  const line = (t: string) => ind + t;
  switch (s.kind) {
    case 'expr': {
      const e = s.expr;
      if (e.kind === 'new-uninit' || e.kind === 'raw') return [line(`/* ${exprStr(e, rc)} */`)];
      if (e.kind === 'assign-expr' && e.target.kind === 'local') {
        const plan = prepareLocalAssignment(e, e.target, rc);
        const declaration =
          plan.kind === 'declare' ? `${plan.jtype ? typeStr(plan.jtype, rc) : 'var'} ` : '';
        const operator = plan.kind === 'assign' && plan.op ? `${plan.op}=` : '=';
        return [
          line(`${declaration}${plan.name} ${operator} ${exprStr(plan.value, rc, PREC.lambda)};`),
        ];
      }
      return [line(`${exprStr(e, rc, PREC.lambda)};`)];
    }
    case 'if': {
      const cond = exprStr(s.cond, rc, PREC.lambda);
      const thenLines = renderBlockOuter(s.thenS, rc, indent + 1);
      if (s.elseS && s.elseS.length) {
        const elseLines = renderBlockOuter(s.elseS, rc, indent + 1);
        return [line(`if (${cond}) {`), ...thenLines, line('} else {'), ...elseLines, line('}')];
      }
      return [line(`if (${cond}) {`), ...thenLines, line('}')];
    }
    case 'while': {
      const label = s.label ? `${s.label}: ` : '';
      const cond = s.cond ? exprStr(s.cond, rc, PREC.lambda) : 'true';
      return [
        line(`${label}while (${cond}) {`),
        ...renderBlockOuter(s.body, rc, indent + 1),
        line('}'),
      ];
    }
    case 'do-while': {
      const label = s.label ? `${s.label}: ` : '';
      const cond = exprStr(s.cond, rc, PREC.lambda);
      return [
        line(`${label}do {`),
        ...renderBlockOuter(s.body, rc, indent + 1),
        line(`} while (${cond});`),
      ];
    }
    case 'for': {
      const label = s.label ? `${s.label}: ` : '';
      const outside = (s as { declareOutside?: boolean }).declareOutside;
      if (outside) {
        const decls: string[] = [];
        for (const st2 of s.init) {
          const d = forInitDeclOutside(st2, rc);
          if (d) decls.push(d);
        }
        const init = s.init.map((st2) => forInitStr(st2, rc, true)).join(', ');
        const cond = s.cond ? exprStr(s.cond, rc, PREC.lambda) : '';
        const update = s.update
          .map((st2) => (st2.kind === 'expr' ? exprStr(st2.expr, rc, PREC.lambda) : ''))
          .join(', ');
        const bodyLines = renderBlockOuter(s.body, rc, indent + 1);
        return [
          ...decls.map((d) => line(d)),
          line(`${label}for (${init}; ${cond}; ${update}) {`),
          ...bodyLines,
          line('}'),
        ];
      }
      const init = s.init.map((st2) => forInitStr(st2, rc)).join(', ');
      const cond = s.cond ? exprStr(s.cond, rc, PREC.lambda) : '';
      const update = s.update
        .map((st2) => (st2.kind === 'expr' ? exprStr(st2.expr, rc, PREC.lambda) : ''))
        .join(', ');
      const bodyLines = renderBlockOuter(s.body, rc, indent + 1);
      return [line(`${label}for (${init}; ${cond}; ${update}) {`), ...bodyLines, line('}')];
    }
    case 'foreach': {
      const label = s.label ? `${s.label}: ` : '';
      const t = typeStr(s.varJType, rc);
      const it = exprStr(s.iterable, rc, PREC.lambda);
      if (s.varSlot !== undefined && declaredNameOf(rc, s.varSlot) === undefined)
        declareSlot(rc, s.varSlot, s.varName);
      const bodyLines = renderBlockOuter(s.body, rc, indent + 1);
      return [line(`${label}for (${t} ${s.varName} : ${it}) {`), ...bodyLines, line('}')];
    }
    case 'switch': {
      const subj = exprStr(s.subject, rc, PREC.lambda);
      const lines = [line(`switch (${subj}) {`)];
      for (const c of s.cases) {
        for (const l of c.labels)
          lines.push(line(`    ${caseLabel(l, !!s.enumMode || !!s.patternMode)}`));
        if (c.hasDefault) lines.push(line('    default:'));
        if (c.body.length) lines.push(...renderBlockOuter(c.body, rc, indent + 1));
      }
      lines.push(line('}'));
      return lines;
    }
    case 'return':
      return [
        line(
          s.expr
            ? `return ${exprStr(prepareReturnValue(s.expr, rc.returnType, rc.declTypes), rc, PREC.lambda)};`
            : 'return;',
        ),
      ];
    case 'throw':
      return [line(`throw ${exprStr(s.expr, rc, PREC.lambda)};`)];
    case 'break':
      return [line(s.label ? `break ${s.label};` : 'break;')];
    case 'continue':
      return [line(s.label ? `continue ${s.label};` : 'continue;')];
    case 'try': {
      const header = s.resources?.length
        ? `try (${s.resources.map((r) => `${typeStr(r.jtype, rc)} ${r.name} = ${r.init ? exprStr(r.init, rc, PREC.lambda) : 'null'}`).join('; ')}) {`
        : 'try {';
      if (s.resources) {
        for (const r of s.resources)
          if (r.slot !== undefined) declareSlot(rc, r.slot, r.name, r.jtype);
      }
      const lines = [line(header), ...renderBlockOuter(s.body, rc, indent + 1)];
      for (const c of s.catches) {
        const extras = (c as { extraTypes?: string[] }).extraTypes ?? [];
        const all = [c.type, ...extras].filter((t): t is string => !!t);
        const type = all.length
          ? all.map((t) => typeStr({ kind: 'class', name: t }, rc)).join(' | ')
          : 'Exception';
        const varN = c.varName ?? 'e';
        lines.push(line(`} catch (${type} ${varN}) {`));
        rc.scopes.push(new Map());
        if (c.varSlot !== undefined) rc.scopes[rc.scopes.length - 1].set(c.varSlot, varN);
        try {
          lines.push(...renderStmts(c.body, rc, indent + 1));
        } finally {
          rc.scopes.pop();
        }
      }
      if (s.finallyS) {
        lines.push(line('} finally {'));
        lines.push(...renderBlockOuter(s.finallyS, rc, indent + 1));
      }
      lines.push(line('}'));
      return lines;
    }
    case 'sync':
      return [
        line(`synchronized (${exprStr(s.monitor, rc, PREC.lambda)}) {`),
        ...renderBlockOuter(s.body, rc, indent + 1),
        line('}'),
      ];
    case 'assert': {
      const c = exprStr(s.cond, rc, PREC.lambda);
      if (s.msg) return [line(`assert ${c} : ${exprStr(s.msg, rc, PREC.lambda)};`)];
      return [line(`assert ${c};`)];
    }
    case 'local-decl': {
      const t = typeStr(s.jtype, rc);
      const init = s.init
        ? ` = ${exprStr(adaptLambdaTarget(s.init, s.jtype), rc, PREC.lambda)}`
        : '';
      if (s.slot !== undefined) declareSlot(rc, s.slot, s.name, s.jtype);
      return [line(`${t} ${s.name}${init};`)];
    }
    case 'label':
      return [line(`${s.label}:`), ...renderStmt(s.inner, rc, indent)];
    case 'bad':
      return [line(`/* ${s.text} */`)];
  }
}

function caseLabel(l: number | string, enumMode: boolean): string {
  if (typeof l === 'string') {
    if (enumMode) return `case ${l}:`;
    return `case "${escapeString(l)}":`;
  }
  return `case ${l}:`;
}
