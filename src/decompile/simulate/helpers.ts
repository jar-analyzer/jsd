import { BinOp, Expr, Stmt } from '../../ast/ast.js';
import { JType, parseMethodDescriptor } from '../../classfile/types.js';

export function isTermOp(op: number): boolean {
  return (
    (op >= 0x99 && op <= 0xb1) ||
    op === 0xbf ||
    op === 0xc6 ||
    op === 0xc7 ||
    op === 0xaa ||
    op === 0xab
  );
}

export function isSuperOwner(owner: string): boolean {
  return false;
}

export function isLoadOp(op: number): boolean {
  return (op >= 0x15 && op <= 0x19) || (op >= 0x1a && op <= 0x2d);
}

export function isGotoOp(op: number): boolean {
  return op === 0xa7 || op === 0xc8;
}

export function isPrimChar(c: string): boolean {
  return ['i', 'l', 'f', 'd', 'b', 'c', 's'].includes(c);
}

export function primOf(c: string): 'int' | 'long' | 'float' | 'double' | 'byte' | 'char' | 'short' {
  switch (c) {
    case 'i':
      return 'int';
    case 'l':
      return 'long';
    case 'f':
      return 'float';
    case 'd':
      return 'double';
    case 'b':
      return 'byte';
    case 'c':
      return 'char';
    case 's':
      return 'short';
  }
  return 'int';
}

export function constType(v: Expr): JType | undefined {
  if (v.kind !== 'const') return undefined;
  switch (v.ctype) {
    case 'int':
      return PRIM_INT;
    case 'long':
      return PRIM_LONG;
    case 'float':
      return PRIM_FLOAT;
    case 'double':
      return PRIM_DOUBLE;
    case 'boolean':
      return PRIM_BOOL;
    case 'string':
      return STR;
    case 'null':
      return { kind: 'class', name: 'java/lang/Object' };
    default:
      return undefined;
  }
}

export function opcodeSlot(name: string): number {
  const m = /_(\d)$/.exec(name);
  return m ? parseInt(m[1], 10) : -1;
}

export function intConstOf(v: number): Expr {
  return { kind: 'const', ctype: 'int', value: v };
}

export function isBoolConst(e: Expr): e is Extract<Expr, { kind: 'const' }> {
  return e.kind === 'const' && e.ctype === 'int' && (e.value === 0 || e.value === 1);
}

export function cmpOp(suffix: string): BinOp {
  switch (suffix) {
    case 'eq':
      return '==';
    case 'ne':
      return '!=';
    case 'lt':
      return '<';
    case 'ge':
      return '>=';
    case 'gt':
      return '>';
    case 'le':
      return '<=';
    default:
      return '==';
  }
}

export function arithType(nm: string): JType | undefined {
  const c = nm[0];
  if (c === 'i') return PRIM_INT;
  if (c === 'l') return PRIM_LONG;
  if (c === 'f') return PRIM_FLOAT;
  if (c === 'd') return PRIM_DOUBLE;
  return undefined;
}

export function isWideRet(desc: string): boolean {
  const ret = desc.slice(desc.lastIndexOf(')') + 1);
  return ret === 'J' || ret === 'D';
}

export function safeMethodDesc(desc: string): { params: JType[]; ret: JType } | null {
  try {
    return parseMethodDescriptor(desc);
  } catch {
    return null;
  }
}

export const PRIM_INT: JType = { kind: 'prim', name: 'int' };
export const PRIM_LONG: JType = { kind: 'prim', name: 'long' };
export const PRIM_FLOAT: JType = { kind: 'prim', name: 'float' };
export const PRIM_DOUBLE: JType = { kind: 'prim', name: 'double' };
export const PRIM_BOOL: JType = { kind: 'prim', name: 'boolean' };
export const STR: JType = { kind: 'class', name: 'java/lang/String' };
export const INT0: Expr = { kind: 'const', ctype: 'int', value: 0 };
export const NULLC: Expr = { kind: 'const', ctype: 'null', value: undefined };

export function replaceInStmt(s: Stmt, uid: number, replacement: Expr): void {
  const rep = (e: Expr): Expr => {
    if (!e || typeof e !== 'object') return e;
    if (e.kind === 'new-uninit' && e.uid === uid) return replacement;
    switch (e.kind) {
      case 'binary':
        e.left = rep(e.left);
        e.right = rep(e.right);
        return e;
      case 'unary':
        e.operand = rep(e.operand);
        return e;
      case 'cast':
        e.expr = rep(e.expr);
        return e;
      case 'instanceof':
        e.expr = rep(e.expr);
        return e;
      case 'invoke':
        if (e.target) e.target = rep(e.target);
        e.args = e.args.map(rep);
        return e;
      case 'new':
        e.args = e.args.map(rep);
        return e;
      case 'new-array':
        e.dimsExprs = e.dimsExprs.map(rep);
        return e;
      case 'array-init':
        e.values = e.values.map(rep);
        return e;
      case 'array-length':
        e.array = rep(e.array);
        return e;
      case 'array-load':
        e.array = rep(e.array);
        e.index = rep(e.index);
        return e;
      case 'field-get':
        if (e.target) e.target = rep(e.target);
        return e;
      case 'ternary':
        e.cond = rep(e.cond);
        e.thenE = rep(e.thenE);
        e.elseE = rep(e.elseE);
        return e;
      case 'bool':
        e.inner = rep(e.inner);
        return e;
      case 'assign-expr':
        e.expr = rep(e.expr);
        return e;
      case 'concat':
        e.parts = e.parts.map(rep);
        return e;
      case 'sb-chain':
        e.parts = e.parts.map(rep);
        return e;
      default:
        return e;
    }
  };
  const repStmt = (st: Stmt): void => {
    if (!st || typeof st !== 'object') return;
    switch (st.kind) {
      case 'expr':
        st.expr = rep(st.expr);
        break;
      case 'if':
        st.cond = rep(st.cond);
        st.thenS.forEach(repStmt);
        st.elseS?.forEach(repStmt);
        break;
      case 'while':
      case 'do-while':
        if (st.cond) st.cond = rep(st.cond);
        st.body.forEach(repStmt);
        break;
      case 'for':
        st.init.forEach(repStmt);
        st.update.forEach(repStmt);
        if (st.cond) st.cond = rep(st.cond);
        st.body.forEach(repStmt);
        break;
      case 'foreach':
        st.iterable = rep(st.iterable);
        st.body.forEach(repStmt);
        break;
      case 'switch':
        st.subject = rep(st.subject);
        break;
      case 'return':
        if (st.expr) st.expr = rep(st.expr);
        break;
      case 'throw':
        st.expr = rep(st.expr);
        break;
      case 'sync':
        st.monitor = rep(st.monitor);
        st.body.forEach(repStmt);
        break;
      case 'assert':
        st.cond = rep(st.cond);
        if (st.msg) st.msg = rep(st.msg);
        break;
      case 'local-decl':
        if (st.init) st.init = rep(st.init);
        break;
      case 'label':
        repStmt(st.inner);
        break;
      default:
        break;
    }
  };
  repStmt(s);
}
