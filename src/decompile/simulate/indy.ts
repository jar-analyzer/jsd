import { Expr, Stmt } from '../../ast/ast.js';
import { Instr } from '../../bytecode/decode.js';
import { JType, parseMethodDescriptor } from '../../classfile/types.js';
import { SimFail } from './index.js';
import type { ExprStack } from './stack.js';
import { isWideRet, STR } from './helpers.js';
import type { Simulator } from './index.js';

export const indyPart: ThisType<Simulator> &
  Pick<Simulator, 'execInvokeDynamic' | 'bootstrapConstToExpr'> = {
  execInvokeDynamic(ins: Instr, stack: ExprStack, stmts: Stmt[]): void {
    const cp = this.cls.cp;
    const d = cp.dynamic(ins.cpIndex!);
    const bsm = this.cls.bootstrapMethods[d.bsm];
    if (!bsm) throw new SimFail('missing bootstrap method #' + d.bsm);
    const bmName = bsm.ref.ref.name;
    const md = parseMethodDescriptor(d.descriptor);
    const args: Expr[] = [];
    for (let i = 0; i < md.params.length; i++) args.unshift(stack.pop());
    if (bmName === 'makeConcatWithConstants' || bmName === 'makeConcat') {
      const recipeArg = bsm.args.find((a) => a.kind === 'string');
      let recipe: string;
      if (recipeArg && recipeArg.kind === 'string') recipe = recipeArg.value;
      else recipe = '\u0001'.repeat(md.params.length);
      const staticConsts = bsm.args.filter(
        (a) => a.kind !== 'methodType' && a.kind !== 'methodHandle' && a !== recipeArg,
      );
      const parts: Expr[] = [];
      const partTypes: (JType | undefined)[] = [];
      let argI = 0,
        constI = 0;
      let lit = '';
      if (recipe.startsWith('\u0001') && md.params.length > 0) {
        const p0 = md.params[0];
        if (p0.kind === 'prim') {
          parts.push({ kind: 'const', ctype: 'string', value: '' });
          partTypes.push(undefined);
        }
      }
      const flushLit = () => {
        if (lit) {
          parts.push({ kind: 'const', ctype: 'string', value: lit });
          partTypes.push(undefined);
          lit = '';
        }
      };
      for (const ch of recipe) {
        if (ch === '\u0001') {
          flushLit();
          parts.push(args[argI] ?? { kind: 'raw', text: '/*?*/' });
          partTypes.push(md.params[argI]);
          argI++;
        } else if (ch === '\u0002') {
          flushLit();
          parts.push(this.bootstrapConstToExpr(staticConsts[constI++]));
          partTypes.push(undefined);
        } else {
          lit += ch;
        }
      }
      flushLit();
      stack.push({ kind: 'concat', parts, partTypes, jtype: STR });
      return;
    }
    if (bmName === 'metafactory' || bmName === 'altMetafactory') {
      const indy: Expr = {
        kind: 'invoke',
        mode: 'special',
        owner: 'java/lang/invoke/LambdaMetafactory',
        name: 'metafactory',
        descriptor: d.descriptor,
        args,
        bootstrap: { name: d.name, index: d.bsm },
      };
      stack.push(indy);
      return;
    }
    if (bmName === 'typeSwitch' || bmName === 'enumSwitch') {
      const selector = args.length >= 2 ? args[args.length - 2] : args[0];
      const caseTypes: string[] = [];
      for (const a of bsm.args) {
        if (a.kind === 'type') caseTypes.push(String(a.typeName));
      }
      this.sim.switchCaseTypes.set(ins.pc, caseTypes);
      stack.push(selector);
      return;
    }
    const recordMethod =
      bsm.ref.ref.owner === 'java/lang/runtime/ObjectMethods' &&
      bmName === 'bootstrap' &&
      this.cls.recordComponents.length > 0;
    if (!recordMethod)
      this.ctx.diagnostics.add({
        code: 'UNSUPPORTED_INVOKEDYNAMIC',
        severity: 'error',
        stage: 'simulate',
        className: this.cls.name,
        methodName: this.method.name,
        descriptor: this.method.descriptor,
        bytecodeOffset: ins.pc,
        message: `Unsupported bootstrap ${bsm.ref.ref.owner}.${bmName}`,
      });
    const fb: Expr = {
      kind: 'raw',
      text: `/* invokedynamic: ${d.name}${d.descriptor} */`,
      jtype: md.ret,
    };
    if (md.ret.kind === 'prim' && md.ret.name === 'void') {
      stmts.push({ kind: 'expr', expr: fb });
    } else {
      stack.push(fb, isWideRet(d.descriptor));
    }
  },

  bootstrapConstToExpr(c: { kind: string; value?: unknown } | undefined): Expr {
    if (!c) return { kind: 'raw', text: '/*?*/' };
    switch (c.kind) {
      case 'string':
        return { kind: 'const', ctype: 'string', value: c.value as string };
      case 'int':
        return { kind: 'const', ctype: 'int', value: c.value as number };
      case 'long':
        return { kind: 'const', ctype: 'long', value: c.value as bigint };
      case 'float':
        return { kind: 'const', ctype: 'float', value: c.value as number };
      case 'double':
        return { kind: 'const', ctype: 'double', value: c.value as number };
      case 'type':
        return { kind: 'class-literal', jtype: { kind: 'class', name: c.value as string } };
      default:
        return { kind: 'raw', text: '/*const*/' };
    }
  },
};
