import { Expr } from '../../ast/ast.js';
import { SimFail } from './result.js';

export interface SE {
  e: Expr;
  w: boolean;
}

export class ExprStack {
  items: SE[] = [];
  clone(): ExprStack {
    const s = new ExprStack();
    s.items = this.items.map((x) => ({
      e: x.e.kind === 'sb-chain' ? { ...x.e, parts: [...x.e.parts] } : x.e,
      w: x.w,
    }));
    return s;
  }
  push(e: Expr, w = false): void {
    this.items.push({ e, w });
  }
  pop(): Expr {
    const x = this.items.pop();
    if (!x) throw new SimFail('operand stack underflow');
    return x.e;
  }
  popSE(): SE {
    const x = this.items.pop();
    if (!x) throw new SimFail('operand stack underflow');
    return x;
  }
  peek(): SE {
    if (!this.items.length) throw new SimFail('operand stack underflow (peek)');
    return this.items[this.items.length - 1];
  }
  get depth(): number {
    return this.items.length;
  }
  dup(): void {
    const t = this.popSE();
    this.items.push(t, { e: t.e, w: t.w });
  }
  dupX1(): void {
    const v1 = this.popSE(),
      v2 = this.popSE();
    this.items.push({ e: v1.e, w: v1.w }, v2, v1);
  }
  dupX2(): void {
    const v1 = this.popSE(),
      v2 = this.popSE();
    if (v2.w) this.items.push({ ...v1 }, v2, v1);
    else {
      const v3 = this.popSE();
      this.items.push({ ...v1 }, v3, v2, v1);
    }
  }
  dup2(): void {
    const t = this.peek();
    if (t.w) {
      this.dup();
    } else {
      const n = this.items.length;
      const a = this.items[n - 2],
        b = this.items[n - 1];
      this.items.push({ e: a.e, w: a.w }, { e: b.e, w: b.w });
    }
  }
  dup2X1(): void {
    const t = this.peek();
    if (t.w) {
      this.dupX1();
    } else {
      const n = this.items.length;
      const v1 = this.items[n - 1],
        v2 = this.items[n - 2],
        v3 = this.items[n - 3];
      this.items.length = n - 3;
      this.items.push({ e: v2.e, w: v2.w }, { e: v1.e, w: v1.w }, v3, v2, v1);
    }
  }
  dup2X2(): void {
    const v1 = this.popSE();
    const top = v1.w ? [v1] : [this.popSE(), v1];
    const v2 = this.popSE();
    const below = v2.w ? [v2] : [this.popSE(), v2];
    this.items.push(...top.map((v) => ({ ...v })), ...below, ...top);
  }
  swap(): void {
    const v1 = this.popSE(),
      v2 = this.popSE();
    this.items.push(v1, v2);
  }
  sameAs(o: ExprStack): boolean {
    if (this.items.length !== o.items.length) return false;
    for (let i = 0; i < this.items.length; i++) {
      if (!exprIdent(this.items[i].e, o.items[i].e)) return false;
      if (this.items[i].w !== o.items[i].w) return false;
    }
    return true;
  }
}

export function exprIdent(a: Expr, b: Expr): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'local':
      return a.slot === (b as typeof a).slot;
    case 'const':
      return a.ctype === (b as typeof a).ctype && Object.is(a.value, (b as typeof a).value);
    case 'this':
    case 'super':
      return true;
    default:
      return false;
  }
}
