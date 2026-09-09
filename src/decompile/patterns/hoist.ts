import { Expr, Stmt } from '../../ast/ast.js';
import type { JType } from '../../classfile/types.js';

export interface HoistResult {
  decls: Stmt[];
  declared: Map<number, string>;
}

export function hoistWideScopeLocals(
  stmts: Stmt[],
  typeOf: (slot: number) => JType | undefined,
  hoistable?: (slot: number) => boolean,
): HoistResult {
  const boundSlots = new Set<number>();
  let nextId = 0;
  const parent = new Map<number, number>();
  const firstAssign = new Map<number, number>();
  const refs = new Map<number, { list: number; name: string }[]>();

  const visitList = (list: Stmt[], listId: number): void => {
    for (const st of list) {
      visitStmt(st, listId);
    }
  };
  const addRef = (slot: number, name: string, listId: number): void => {
    if (boundSlots.has(slot)) return;
    let arr = refs.get(slot);
    if (!arr) refs.set(slot, (arr = []));
    arr.push({ list: listId, name });
  };
  const visitStmt = (st: Stmt, listId: number): void => {
    const child = (list: Stmt[] | undefined): void => {
      if (!list || !list.length) return;
      const id = nextId++;
      parent.set(id, listId);
      visitList(list, id);
    };
    switch (st.kind) {
      case 'expr': {
        const e = st.expr;
        if (e.kind === 'assign-expr' && e.target.kind === 'local' && !e.op) {
          const slot = (e.target as { slot: number }).slot;
          if (!firstAssign.has(slot)) firstAssign.set(slot, listId);
          addRef(slot, (e.target as { name: string }).name, listId);
          visitExpr(e.expr, listId);
        } else if (
          e.kind === 'unary' &&
          ['x++', 'x--', '++x', '--x'].includes(e.op) &&
          e.operand.kind === 'local'
        ) {
          const slot = (e.operand as { slot: number }).slot;
          if (!firstAssign.has(slot)) firstAssign.set(slot, listId);
          addRef(slot, (e.operand as { name: string }).name, listId);
        } else {
          visitExpr(e, listId);
        }
        break;
      }
      case 'if':
        visitExpr(st.cond, listId);
        child(st.thenS);
        child(st.elseS);
        break;
      case 'while':
        if (st.cond) visitExpr(st.cond, listId);
        child(st.body);
        break;
      case 'do-while':
        visitExpr(st.cond, listId);
        child(st.body);
        break;
      case 'for': {
        const scope = nextId++;
        parent.set(scope, listId);
        visitList(st.init, scope);
        if (st.cond) visitExpr(st.cond, scope);
        visitList(st.update, scope);
        const bodyScope = nextId++;
        parent.set(bodyScope, scope);
        visitList(st.body, bodyScope);
        break;
      }
      case 'foreach':
        visitExpr(st.iterable, listId);
        if (st.varSlot !== undefined) addRef(st.varSlot, st.varName, listId);
        child(st.body);
        break;
      case 'switch':
        visitExpr(st.subject, listId);
        for (const c of st.cases) child(c.body);
        break;
      case 'try':
        child(st.body);
        for (const c of st.catches) {
          const bound = c.varSlot !== undefined && !boundSlots.has(c.varSlot);
          if (bound) boundSlots.add(c.varSlot!);
          child(c.body);
          if (bound) boundSlots.delete(c.varSlot!);
        }
        child(st.finallyS);
        break;
      case 'sync':
        visitExpr(st.monitor, listId);
        child(st.body);
        break;
      case 'assert':
        visitExpr(st.cond, listId);
        if (st.msg) visitExpr(st.msg, listId);
        break;
      case 'return':
        if (st.expr) visitExpr(st.expr, listId);
        break;
      case 'throw':
        visitExpr(st.expr, listId);
        break;
      case 'local-decl':
        if (st.slot !== undefined && st.init) {
          if (!firstAssign.has(st.slot)) firstAssign.set(st.slot, listId);
          addRef(st.slot, st.name, listId);
        }
        break;
      case 'label':
        visitStmt(st.inner, listId);
        break;
      default:
        break;
    }
  };
  const visitExpr = (e: Expr, listId: number): void => {
    if (!e || typeof e !== 'object') return;
    if (e.kind === 'local') {
      addRef(e.slot, e.name, listId);
      return;
    }
    switch (e.kind) {
      case 'binary':
        visitExpr(e.left, listId);
        visitExpr(e.right, listId);
        break;
      case 'unary':
        visitExpr(e.operand, listId);
        break;
      case 'cast':
        visitExpr(e.expr, listId);
        break;
      case 'instanceof':
        visitExpr(e.expr, listId);
        break;
      case 'invoke':
        if (e.target) visitExpr(e.target, listId);
        e.args.forEach((a) => visitExpr(a, listId));
        break;
      case 'new':
        e.args.forEach((a) => visitExpr(a, listId));
        break;
      case 'new-array':
        e.dimsExprs.forEach((a) => visitExpr(a, listId));
        break;
      case 'array-init':
        e.values.forEach((a) => visitExpr(a, listId));
        break;
      case 'array-length':
        visitExpr(e.array, listId);
        break;
      case 'array-load':
        visitExpr(e.array, listId);
        visitExpr(e.index, listId);
        break;
      case 'field-get':
        if (e.target) visitExpr(e.target, listId);
        break;
      case 'ternary':
        visitExpr(e.cond, listId);
        visitExpr(e.thenE, listId);
        visitExpr(e.elseE, listId);
        break;
      case 'assign-expr':
        visitExpr(e.expr, listId);
        break;
      case 'concat':
        e.parts.forEach((a) => visitExpr(a, listId));
        break;
      default:
        break;
    }
  };

  const rootId = nextId++;
  visitList(stmts, rootId);

  const isDescOrSelf = (a: number, b: number): boolean => {
    let x = a;
    while (x !== undefined) {
      if (x === b) return true;
      x = parent.get(x)!;
    }
    return false;
  };

  const decls: Stmt[] = [];
  const declared = new Map<number, string>();
  const done = new Set<number>();
  for (const slot of firstAssign.keys()) {
    if (done.has(slot)) continue;
    done.add(slot);
    if (hoistable && !hoistable(slot)) continue;
    const first = firstAssign.get(slot)!;
    const allRefs = refs.get(slot) ?? [];
    const needsHoist = allRefs.some((r) => !isDescOrSelf(r.list, first));
    if (!needsHoist) continue;
    const name = allRefs[0]?.name ?? `var${slot}`;
    const t = typeOf(slot) ?? { kind: 'class', name: 'java/lang/Object' };
    let init: Expr | undefined;
    if (t.kind === 'prim') {
      if (t.name === 'boolean') init = { kind: 'const', ctype: 'boolean', value: false };
      else if (t.name === 'float') init = { kind: 'const', ctype: 'float', value: 0 };
      else if (t.name === 'double') init = { kind: 'const', ctype: 'double', value: 0 };
      else if (t.name === 'long') init = { kind: 'const', ctype: 'long', value: 0n };
      else if (t.name === 'char') init = { kind: 'const', ctype: 'int', value: 0 };
      else if (t.name !== 'void') init = { kind: 'const', ctype: 'int', value: 0 };
    } else {
      init = { kind: 'const', ctype: 'null', value: undefined };
    }
    decls.push({ kind: 'local-decl', jtype: t, name, slot, init });
    declared.set(slot, name);
  }
  return { decls, declared };
}

export function markExternalForDecls(stmts: Stmt[]): void {
  let nextId = 0;
  const parent = new Map<number, number>();
  const refs = new Map<string, number[]>();
  const forEntries: { stmt: Stmt; ownIds: number[]; slots: string[] }[] = [];

  const addRef = (slot: number, name: string | undefined, listId: number): void => {
    const key = `${slot}:${name ?? ''}`;
    let arr = refs.get(key);
    if (!arr) refs.set(key, (arr = []));
    arr.push(listId);
  };
  const childId = (listId: number): number => {
    const id = nextId++;
    parent.set(id, listId);
    return id;
  };
  const visitExpr = (e: Expr, listId: number): void => {
    if (!e || typeof e !== 'object') return;
    if (e.kind === 'local') {
      addRef(e.slot, e.name, listId);
      return;
    }
    switch (e.kind) {
      case 'binary':
        visitExpr(e.left, listId);
        visitExpr(e.right, listId);
        break;
      case 'unary':
        visitExpr(e.operand, listId);
        break;
      case 'cast':
        visitExpr(e.expr, listId);
        break;
      case 'instanceof':
        visitExpr(e.expr, listId);
        break;
      case 'invoke':
        if (e.target) visitExpr(e.target, listId);
        e.args.forEach((a) => visitExpr(a, listId));
        break;
      case 'new':
        e.args.forEach((a) => visitExpr(a, listId));
        break;
      case 'new-array':
        e.dimsExprs.forEach((a) => visitExpr(a, listId));
        break;
      case 'array-init':
        e.values.forEach((a) => visitExpr(a, listId));
        break;
      case 'array-length':
        visitExpr(e.array, listId);
        break;
      case 'array-load':
        visitExpr(e.array, listId);
        visitExpr(e.index, listId);
        break;
      case 'field-get':
        if (e.target) visitExpr(e.target, listId);
        break;
      case 'ternary':
        visitExpr(e.cond, listId);
        visitExpr(e.thenE, listId);
        visitExpr(e.elseE, listId);
        break;
      case 'assign-expr':
        visitExpr(e.expr, listId);
        break;
      case 'concat':
        e.parts.forEach((a) => visitExpr(a, listId));
        break;
      default:
        break;
    }
  };
  const assignRefOf = (st: Stmt): { slot: number; name: string } | null => {
    if (st.kind !== 'expr') return null;
    const e = st.expr;
    if (e.kind === 'assign-expr' && e.target.kind === 'local')
      return {
        slot: (e.target as { slot: number }).slot,
        name: (e.target as { name: string }).name,
      };
    if (
      e.kind === 'unary' &&
      ['x++', 'x--', '++x', '--x'].includes(e.op) &&
      e.operand.kind === 'local'
    )
      return {
        slot: (e.operand as { slot: number }).slot,
        name: (e.operand as { name: string }).name,
      };
    return null;
  };
  const visitStmt = (st: Stmt, listId: number): void => {
    switch (st.kind) {
      case 'for': {
        const slots: string[] = [];
        for (const ini of st.init) {
          const r = assignRefOf(ini);
          if (r) slots.push(`${r.slot}:${r.name}`);
        }
        const ownIds: number[] = [];
        forEntries.push({ stmt: st, ownIds, slots });
        const hdrId = childId(listId);
        ownIds.push(hdrId);
        if (st.cond) visitExpr(st.cond, hdrId);
        const updId = childId(listId);
        ownIds.push(updId);
        for (const u of st.update) visitStmt(u, updId);
        const bodyId = childId(listId);
        ownIds.push(bodyId);
        for (const b of st.body) visitStmt(b, bodyId);
        break;
      }
      case 'expr': {
        const r = assignRefOf(st);
        if (r) addRef(r.slot, r.name, listId);
        else visitExpr(st.expr, listId);
        break;
      }
      case 'foreach':
        visitExpr(st.iterable, listId);
        if (st.varSlot !== undefined) addRef(st.varSlot, st.varName, listId);
        for (const b of st.body) visitStmt(b, childId(listId));
        break;
      case 'if':
        visitExpr(st.cond, listId);
        for (const b of st.thenS) visitStmt(b, childId(listId));
        for (const b of st.elseS ?? []) visitStmt(b, childId(listId));
        break;
      case 'while':
        if (st.cond) visitExpr(st.cond, listId);
        for (const b of st.body) visitStmt(b, childId(listId));
        break;
      case 'do-while':
        visitExpr(st.cond, listId);
        for (const b of st.body) visitStmt(b, childId(listId));
        break;
      case 'switch':
        visitExpr(st.subject, listId);
        for (const c of st.cases) for (const b of c.body) visitStmt(b, childId(listId));
        break;
      case 'try':
        for (const b of st.body) visitStmt(b, childId(listId));
        for (const c of st.catches) for (const b of c.body) visitStmt(b, childId(listId));
        for (const b of st.finallyS ?? []) visitStmt(b, childId(listId));
        break;
      case 'sync':
        visitExpr(st.monitor, listId);
        for (const b of st.body) visitStmt(b, childId(listId));
        break;
      case 'assert':
        visitExpr(st.cond, listId);
        if (st.msg) visitExpr(st.msg, listId);
        break;
      case 'return':
        if (st.expr) visitExpr(st.expr, listId);
        break;
      case 'throw':
        visitExpr(st.expr, listId);
        break;
      case 'label':
        visitStmt(st.inner, listId);
        break;
      default:
        break;
    }
  };
  const rootId = nextId++;
  for (const st of stmts) visitStmt(st, rootId);

  const isDescOrSelf = (a: number, b: number): boolean => {
    let x: number | undefined = a;
    while (x !== undefined) {
      if (x === b) return true;
      x = parent.get(x);
    }
    return false;
  };
  for (const fe of forEntries) {
    const outside = fe.slots.some((key) =>
      (refs.get(key) ?? []).some((lid) => !fe.ownIds.some((oid) => isDescOrSelf(lid, oid))),
    );
    if (outside) (fe.stmt as { declareOutside?: boolean }).declareOutside = true;
  }
}

export function transformChildren(s: Stmt, fn: (list: Stmt[]) => Stmt[]): void {
  switch (s.kind) {
    case 'if':
      s.thenS = fn(s.thenS);
      if (s.elseS) s.elseS = fn(s.elseS);
      break;
    case 'while':
    case 'do-while':
      s.body = fn(s.body);
      break;
    case 'for':
      s.init = fn(s.init);
      s.update = fn(s.update);
      s.body = fn(s.body);
      break;
    case 'foreach':
      s.body = fn(s.body);
      break;
    case 'switch':
      for (const c of s.cases) c.body = fn(c.body);
      break;
    case 'try':
      s.body = fn(s.body);
      for (const c of s.catches) c.body = fn(c.body);
      if (s.finallyS) s.finallyS = fn(s.finallyS);
      break;
    case 'sync':
      s.body = fn(s.body);
      break;
    case 'label':
      break;
    default:
      break;
  }
}
