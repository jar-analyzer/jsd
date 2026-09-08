import type { JType } from '../classfile/types.js';

export type Expr =
  | { kind: 'local'; slot: number; name: string; jtype?: JType }
  | { kind: 'this' }
  | { kind: 'super' }
  | { kind: 'outer-this'; owner: string }
  | {
      kind: 'const';
      ctype: ConstKind;
      value: number | bigint | string | boolean | undefined;
      jtype?: JType;
    }
  | {
      kind: 'binary';
      op: BinOp;
      left: Expr;
      right: Expr;
      jtype?: JType;
      nanResult?: -1 | 1;
      floatingComparison?: boolean;
    }
  | { kind: 'unary'; op: UnaryOp; operand: Expr; jtype?: JType }
  | { kind: 'cast'; jtype: JType; expr: Expr }
  | { kind: 'instanceof'; expr: Expr; checkType: JType; bindName?: string }
  | {
      kind: 'invoke';
      mode: 'virtual' | 'static' | 'special' | 'interface';
      owner: string;
      name: string;
      descriptor: string;
      target?: Expr;
      args: Expr[];
      superCall?: boolean;
      erasedLambda?: boolean;
      bootstrap?: { name: string; index: number; interfaces?: string[] };
    }
  | { kind: 'new'; owner: string; descriptor?: string; args: Expr[]; outer?: Expr }
  | { kind: 'new-array'; elemType: JType; dimsExprs: Expr[]; dims: number; jtype?: JType }
  | { kind: 'array-init'; elemType: JType; values: Expr[] }
  | { kind: 'array-length'; array: Expr }
  | { kind: 'array-load'; array: Expr; index: Expr; jtype?: JType }
  | { kind: 'field-get'; owner: string; name: string; target?: Expr; jtype?: JType }
  | { kind: 'ternary'; cond: Expr; thenE: Expr; elseE: Expr; jtype?: JType }
  | { kind: 'bool'; inner: Expr }
  | { kind: 'assign-expr'; target: AssignTarget; expr: Expr; op?: BinOp }
  | { kind: 'lambda'; params: { name: string; jtype?: JType }[]; body: Stmt[]; exprBody?: Expr }
  | {
      kind: 'method-ref';
      owner: string;
      name: string;
      target?: Expr;
      isNew?: boolean;
      descriptor: string;
      kindRef?: string;
    }
  | { kind: 'concat'; parts: Expr[]; partTypes?: (JType | undefined)[]; jtype?: JType }
  | { kind: 'class-literal'; jtype: JType }
  | { kind: 'monitor'; expr: Expr }
  | { kind: 'new-uninit'; owner: string; uid: number }
  | { kind: 'sb-chain'; parts: Expr[]; jtype?: JType }
  | { kind: 'raw'; text: string; jtype?: JType };

export type ConstKind =
  | 'char'
  | 'int'
  | 'long'
  | 'float'
  | 'double'
  | 'string'
  | 'null'
  | 'boolean'
  | 'type'
  | 'method-type'
  | 'method-handle'
  | 'dynamic';

export type BinOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '<<'
  | '>>'
  | '>>>'
  | '&'
  | '|'
  | '^'
  | '<'
  | '>'
  | '<='
  | '>='
  | '=='
  | '!='
  | '&&'
  | '||'
  | 'cmp';

export type UnaryOp = '-' | '!' | '~' | '+' | '++x' | '--x' | 'x++' | 'x--';

export type AssignTarget =
  | { kind: 'local'; slot: number; name: string; jtype?: JType }
  | { kind: 'field'; owner: string; name: string; target?: Expr }
  | { kind: 'array'; array: Expr; index: Expr };

export type Stmt =
  | { kind: 'expr'; expr: Expr }
  | { kind: 'if'; cond: Expr; thenS: Stmt[]; elseS?: Stmt[] }
  | { kind: 'while'; cond: Expr | null; body: Stmt[]; label?: string }
  | { kind: 'do-while'; cond: Expr; body: Stmt[]; label?: string }
  | { kind: 'for'; init: Stmt[]; cond: Expr | null; update: Stmt[]; body: Stmt[]; label?: string }
  | {
      kind: 'foreach';
      varJType: JType;
      varName: string;
      iterable: Expr;
      body: Stmt[];
      varSlot?: number;
      label?: string;
    }
  | {
      kind: 'switch';
      subject: Expr;
      cases: SwitchCase[];
      stringMode?: boolean;
      enumMode?: { enumClass: string; labels: string[] };
      patternMode?: boolean;
      scopedCases?: boolean;
    }
  | { kind: 'return'; expr?: Expr }
  | { kind: 'throw'; expr: Expr }
  | { kind: 'break'; label?: string }
  | { kind: 'continue'; label?: string }
  | {
      kind: 'try';
      body: Stmt[];
      catches: {
        type: string | null;
        typeName?: string;
        varName?: string;
        varSlot?: number;
        body: Stmt[];
      }[];
      finallyS?: Stmt[];
      resources?: { jtype: JType; name: string; slot: number; init?: Expr }[];
    }
  | { kind: 'sync'; monitor: Expr; body: Stmt[] }
  | { kind: 'assert'; cond: Expr; msg?: Expr }
  | { kind: 'local-decl'; jtype: JType; name: string; slot?: number; init?: Expr }
  | { kind: 'label'; label: string; inner: Stmt }
  | { kind: 'bad'; text: string };

export interface SwitchCase {
  labels: (number | string)[];
  body: Stmt[];
  hasDefault?: boolean;
}

export function localRef(slot: number, name: string, jtype?: JType): Expr {
  return { kind: 'local', slot, name, jtype };
}
export function intConst(v: number): Expr {
  return { kind: 'const', ctype: 'int', value: v };
}
export function isConstInt(e: Expr, v: number): boolean {
  return e.kind === 'const' && e.ctype === 'int' && e.value === v;
}

export function exprEq(a: Expr | undefined, b: Expr | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'local':
      return a.slot === (b as typeof a).slot;
    case 'this':
    case 'super':
      return true;
    case 'const':
      return a.ctype === (b as typeof a).ctype && Object.is(a.value, (b as typeof a).value);
    case 'binary': {
      const bb = b as typeof a;
      return (
        a.op === bb.op &&
        a.nanResult === bb.nanResult &&
        a.floatingComparison === bb.floatingComparison &&
        exprEq(a.left, bb.left) &&
        exprEq(a.right, bb.right)
      );
    }
    case 'field-get': {
      const bb = b as typeof a;
      return a.owner === bb.owner && a.name === bb.name && exprEq(a.target, bb.target);
    }
    default:
      return false;
  }
}

export function walkExpr(e: Expr, fn: (x: Expr) => void): void {
  if (!e || typeof e !== 'object') return;
  fn(e);
  switch (e.kind) {
    case 'binary':
      walkExpr(e.left, fn);
      walkExpr(e.right, fn);
      break;
    case 'unary':
      walkExpr(e.operand, fn);
      break;
    case 'cast':
      walkExpr(e.expr, fn);
      break;
    case 'instanceof':
      walkExpr(e.expr, fn);
      break;
    case 'invoke':
      if (e.target) walkExpr(e.target, fn);
      e.args.forEach((a) => walkExpr(a, fn));
      break;
    case 'new':
      e.args.forEach((a) => walkExpr(a, fn));
      if (e.outer) walkExpr(e.outer, fn);
      break;
    case 'new-array':
      e.dimsExprs.forEach((a) => walkExpr(a, fn));
      break;
    case 'array-init':
      e.values.forEach((a) => walkExpr(a, fn));
      break;
    case 'array-length':
      walkExpr(e.array, fn);
      break;
    case 'array-load':
      walkExpr(e.array, fn);
      walkExpr(e.index, fn);
      break;
    case 'field-get':
      if (e.target) walkExpr(e.target, fn);
      break;
    case 'ternary':
      walkExpr(e.cond, fn);
      walkExpr(e.thenE, fn);
      walkExpr(e.elseE, fn);
      break;
    case 'bool':
      walkExpr(e.inner, fn);
      break;
    case 'assign-expr':
      walkExpr(e.expr, fn);
      break;
    case 'concat':
      e.parts.forEach((a) => walkExpr(a, fn));
      break;
    case 'method-ref':
      if (e.target) walkExpr(e.target, fn);
      break;
    case 'lambda':
      break;
    case 'sb-chain':
      e.parts.forEach((a) => walkExpr(a, fn));
      break;
  }
}

export function walkStmt(s: Stmt, fn: (x: Stmt) => void): void {
  if (!s || typeof s !== 'object') return;
  fn(s);
  switch (s.kind) {
    case 'if':
      s.thenS.forEach((x) => walkStmt(x, fn));
      s.elseS?.forEach((x) => walkStmt(x, fn));
      break;
    case 'while':
    case 'do-while':
      s.body.forEach((x) => walkStmt(x, fn));
      break;
    case 'for':
      s.init.forEach((x) => walkStmt(x, fn));
      s.update.forEach((x) => walkStmt(x, fn));
      s.body.forEach((x) => walkStmt(x, fn));
      break;
    case 'foreach':
      s.body.forEach((x) => walkStmt(x, fn));
      break;
    case 'switch':
      s.cases.forEach((c) => c.body.forEach((x) => walkStmt(x, fn)));
      break;
    case 'try':
      s.body.forEach((x) => walkStmt(x, fn));
      s.catches.forEach((c) => c.body.forEach((x) => walkStmt(x, fn)));
      s.finallyS?.forEach((x) => walkStmt(x, fn));
      break;
    case 'sync':
      s.body.forEach((x) => walkStmt(x, fn));
      break;
    case 'label':
      walkStmt(s.inner, fn);
      break;
    default:
      break;
  }
}

export function walkStmtExprs(s: Stmt, fn: (x: Expr) => void): void {
  walkStmt(s, (st) => {
    switch (st.kind) {
      case 'expr':
        walkExpr(st.expr, fn);
        break;
      case 'if':
        walkExpr(st.cond, fn);
        break;
      case 'while':
        if (st.cond) walkExpr(st.cond, fn);
        break;
      case 'do-while':
        walkExpr(st.cond, fn);
        break;
      case 'for':
        if (st.cond) walkExpr(st.cond, fn);
        break;
      case 'foreach':
        walkExpr(st.iterable, fn);
        break;
      case 'switch':
        walkExpr(st.subject, fn);
        break;
      case 'return':
        if (st.expr) walkExpr(st.expr, fn);
        break;
      case 'throw':
        walkExpr(st.expr, fn);
        break;
      case 'assert':
        walkExpr(st.cond, fn);
        if (st.msg) walkExpr(st.msg, fn);
        break;
      case 'sync':
        walkExpr(st.monitor, fn);
        break;
      case 'local-decl':
        if (st.init) walkExpr(st.init, fn);
        break;
    }
  });
}
