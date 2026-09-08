import { Expr } from '../../ast/ast.js';
import { Instr } from '../../bytecode/decode.js';
import type { ExprStack } from './stack.js';
import { cmpOp, isBoolConst, safeMethodDesc, PRIM_BOOL, INT0, NULLC } from './helpers.js';
import type { Simulator } from './index.js';

export const condPart: ThisType<Simulator> & Pick<Simulator, 'buildCond' | 'isBooleanish'> = {
  buildCond(ins: Instr, stack: ExprStack): Expr {
    const name = ins.name;
    if (name.startsWith('if_icmp')) {
      const b = stack.pop(),
        a = stack.pop();
      return { kind: 'binary', op: cmpOp(name.slice(7)), left: a, right: b, jtype: PRIM_BOOL };
    }
    if (name.startsWith('if_acmp')) {
      const b = stack.pop(),
        a = stack.pop();
      return { kind: 'binary', op: cmpOp(name.slice(7)), left: a, right: b, jtype: PRIM_BOOL };
    }
    const v = stack.pop();
    if (name === 'ifnull' || name === 'ifnonnull') {
      return {
        kind: 'binary',
        op: name === 'ifnull' ? '==' : '!=',
        left: v,
        right: NULLC,
        jtype: PRIM_BOOL,
      };
    }
    const suffix = name.slice(2);
    if (v.kind === 'binary' && v.op === 'cmp') {
      const op = cmpOp(suffix);
      const floatingComparison = v.nanResult !== undefined;

      const unorderedTrue =
        v.nanResult === 1
          ? ['gt', 'ge'].includes(suffix)
          : v.nanResult === -1 && ['lt', 'le'].includes(suffix);
      if (unorderedTrue) {
        const opposite = { gt: 'le', ge: 'lt', lt: 'ge', le: 'gt' }[suffix]!;
        return {
          kind: 'unary',
          op: '!',
          operand: {
            kind: 'binary',
            op: cmpOp(opposite),
            left: v.left,
            right: v.right,
            jtype: PRIM_BOOL,
            floatingComparison,
          },
          jtype: PRIM_BOOL,
        };
      }
      return {
        kind: 'binary',
        op,
        left: v.left,
        right: v.right,
        jtype: PRIM_BOOL,
        floatingComparison,
      };
    }
    if (this.isBooleanish(v)) {
      if (suffix === 'ne') return v;
      return { kind: 'unary', op: '!', operand: v, jtype: PRIM_BOOL };
    }
    if (isBoolConst(v)) {
      const b = v.value === 1;
      return { kind: 'const', ctype: 'boolean', value: suffix === 'ne' ? b : !b };
    }
    return { kind: 'binary', op: cmpOp(suffix), left: v, right: INT0, jtype: PRIM_BOOL };
  },

  isBooleanish(e: Expr): boolean {
    if (e.kind === 'local') {
      const t = e.jtype ?? this.ctx.slotType(this.method, e.slot, 0);
      return t?.kind === 'prim' && t.name === 'boolean';
    }
    if (e.kind === 'instanceof') return true;
    if (e.kind === 'unary' && e.op === '!') return true;
    if (e.kind === 'field-get') {
      const t = e.jtype;
      return t?.kind === 'prim' && t.name === 'boolean';
    }
    if (e.kind === 'binary') return ['&&', '||', '<', '>', '<=', '>=', '==', '!='].includes(e.op);
    if (e.kind === 'invoke') {
      const d = safeMethodDesc(e.descriptor);
      return !!d && d.ret.kind === 'prim' && d.ret.name === 'boolean';
    }
    return false;
  },
};
