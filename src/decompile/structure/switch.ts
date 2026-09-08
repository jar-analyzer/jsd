import type { SwitchLabel } from '../simulate/result.js';
import { attemptRecognition } from './recognition.js';
import { Expr, Stmt } from '../../ast/ast.js';
import type { ClassFile } from '../../classfile/model.js';
import { decodeBytecode } from '../../bytecode/decode.js';
import type { WalkCtx, Breakable } from './types.js';
import { sameExpr, strHash } from './conditions.js';
import type { Structurer } from './index.js';

const decodeCache = new WeakMap<Uint8Array, ReturnType<typeof decodeBytecode>>();
function decodeOf(code: Uint8Array): ReturnType<typeof decodeBytecode> {
  let d = decodeCache.get(code);
  if (!d) {
    d = decodeBytecode(code);
    decodeCache.set(code, d);
  }
  return d;
}

function isPushConst(op: number): boolean {
  return (op >= 0x02 && op <= 0x08) || op === 0x10 || op === 0x11;
}
function constValOf(ins: { op: number; imm?: number }): number {
  if (ins.op >= 0x02 && ins.op <= 0x08) return ins.op - 0x03;
  return ins.imm ?? 0;
}

export const switchPart: ThisType<Structurer> &
  Pick<
    Structurer,
    'handleSwitch' | 'caseBody' | 'tryStringSwitch' | 'tryEnumSwitch' | 'buildEnumSwitchMap'
  > = {
  handleSwitch(
    b: number,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
    stmts: Stmt[],
  ): number {
    const term = this.t(b) as {
      t: 'switch';
      ins: { op: number };
      cases: { value: number | null; target: number }[];
    };
    const subject = this.switchSubject(b);

    const ss = attemptRecognition(this, [nodes, follow, wctx, stmts], () =>
      this.tryStringSwitch(b, subject, nodes, follow, wctx),
    );
    if (ss) {
      stmts.push(ss.stmt);
      return ss.next;
    }
    const es = attemptRecognition(this, [nodes, follow, wctx, stmts], () =>
      this.tryEnumSwitch(b, subject, nodes, follow, wctx),
    );
    if (es) {
      stmts.push(es.stmt);
      return es.next;
    }

    let patCaseTypes: SwitchLabel[] | null = null;
    for (const ins of this.cfg.blocks[b].instrs) {
      if (ins.op === 0xba) {
        const ct = this.sim.switchCaseTypes?.get(ins.pc);
        if (ct && ct.length) patCaseTypes = ct;
      }
    }
    let followNode: number;
    if (patCaseTypes) {
      const armIds = term.cases
        .map((c) => c.target)
        .filter((a) => a >= 0 && this.cfg.blocks[a].succs.length > 0);
      const reach = armIds.map((a) => this.reachableSet(a));
      followNode = -1;
      if (reach.length) {
        const common = [...reach[0]].filter((x) => reach.every((ss) => ss.has(x)));
        for (const c of common) {
          if (
            nodes.has(c) &&
            !follow.has(c) &&
            !this.claimed[c] &&
            !armIds.includes(c) &&
            !this.isHandlerEntryPc(this.cfg.blocks[c].startPc)
          ) {
            followNode = c;
            break;
          }
        }
      }
      if (followNode === -1)
        followNode = this.pickFollow(
          b,
          nodes,
          follow,
          term.cases.map((c) => c.target),
        );
    } else {
      followNode = this.pickFollow(
        b,
        nodes,
        follow,
        term.cases.map((c) => c.target),
      );
    }
    const brk: Breakable = {
      kind: 'switch',
      exits: new Set([followNode, ...follow]),
      naturalExit: followNode,
      stmt: {},
    };
    const wctx2: WalkCtx = {
      implicitEnds: wctx.implicitEnds,
      breakables: [...wctx.breakables, brk],
    };

    const patMode = !!patCaseTypes;
    const ordered = [...term.cases]
      .filter((c) => c.value !== null)
      .sort((x, y) => this.cfg.blocks[x.target].startPc - this.cfg.blocks[y.target].startPc);
    const dflt = term.cases.find((c) => c.value === null);

    const groups: { value: number; target: number }[] = [];
    for (const c of ordered) {
      const last = groups[groups.length - 1];
      if (last && last.target === c.target) continue;
      groups.push(c as { value: number; target: number });
    }

    if (dflt && !groups.some((g) => g.target === dflt.target))
      groups.push({ value: NaN, target: dflt.target });
    groups.sort((a, b) =>
      patMode
        ? Number.isNaN(a.value)
          ? 1
          : Number.isNaN(b.value)
            ? -1
            : a.value - b.value
        : this.cfg.blocks[a.target].startPc - this.cfg.blocks[b.target].startPc,
    );
    const caseTargets = groups.map((g) => g.target);
    const caseTypes = patCaseTypes;
    const cases: { labels: (number | string)[]; body: Stmt[]; hasDefault?: boolean }[] = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const later = new Set(caseTargets.slice(gi + 1));
      let bindName: string | null = null;
      if (caseTypes?.[g.value]?.kind === 'type') {
        const st = this.sim.stmts[g.target];
        if (
          st.length &&
          st[0].kind === 'expr' &&
          st[0].expr.kind === 'assign-expr' &&
          st[0].expr.target.kind === 'local' &&
          st[0].expr.expr.kind === 'cast' &&
          subject.kind === 'local' &&
          (st[0].expr.expr.expr as { kind?: string; slot?: number }).kind === 'local' &&
          (st[0].expr.expr.expr as { slot?: number }).slot === (subject as { slot: number }).slot
        ) {
          bindName = (st[0].expr.target as { name: string }).name;
          st.shift();
        }
      }
      const body = this.caseBody(
        g.target,
        nodes,
        new Set([...follow, ...(followNode >= 0 ? [followNode] : [])]),
        later,
        wctx2,
      );
      let labels: (number | string)[];
      if (Number.isNaN(g.value)) {
        labels = [];
      } else if (patMode && caseTypes) {
        labels = ordered
          .filter((entry) => entry.target === g.target)
          .map((entry) => {
            if (entry.value === -1) return 'null';
            const label = caseTypes[entry.value as number];
            if (!label) throw new Error(`Invalid dynamic switch label index ${entry.value}`);
            if (label.kind === 'constant') return label.text;
            const display = label.text.replace(/\//g, '.').replace(/\$/g, '.');
            if (!bindName)
              throw new Error('Dynamic type switch has no recoverable pattern binding');
            return `${display} ${bindName}`;
          });
      } else {
        labels = [g.value];
        for (const c of ordered) {
          if (c.target === g.target && c.value !== g.value && !labels.includes(c.value as number))
            labels.push(c.value as number);
        }
        labels = labels.sort((a, z) => (a as number) - (z as number));
      }
      const hasDefault = !!dflt && dflt.target === g.target;
      cases.push({ labels, body, hasDefault });
    }
    if (
      dflt &&
      dflt.target >= 0 &&
      !caseTargets.includes(dflt.target) &&
      dflt.target !== followNode
    ) {
      const body = this.caseBody(
        dflt.target,
        nodes,
        new Set([...follow, ...(followNode >= 0 ? [followNode] : [])]),
        new Set(),
        wctx2,
      );
      cases.push({ labels: [], body, hasDefault: true });
    }
    const scopedCases =
      subject.kind === 'invoke' &&
      [...(this.ctx.dynamicSwitches.get(this.cls)?.values() ?? [])].some(
        (entry) => entry.name === subject.name,
      );
    const sw: Stmt = { kind: 'switch', subject, cases, scopedCases };
    if (patMode) (sw as { patternMode?: boolean }).patternMode = true;
    stmts.push(sw);
    return followNode;
  },

  caseBody(
    target: number,
    nodes: Set<number>,
    followPlus: Set<number>,
    laterCaseTargets: Set<number>,
    wctx: WalkCtx,
  ): Stmt[] {
    if (!nodes.has(target) || followPlus.has(target) || this.claimed[target]) {
      return [];
    }
    const stops = new Set<number>([...followPlus, ...laterCaseTargets]);
    const set = this.dfsCollect(target, nodes, stops, this.claimedSet());
    return this.walk(target, set, new Set([...followPlus, ...laterCaseTargets]), wctx);
  },

  tryStringSwitch(
    b: number,
    subject: Expr,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
  ): { stmt: Stmt; next: number } | null {
    if (
      subject.kind !== 'invoke' ||
      subject.name !== 'hashCode' ||
      subject.args.length !== 0 ||
      !subject.target
    )
      return null;
    const sExpr = subject.target;
    const term = this.t(b) as { t: 'switch'; cases: { value: number | null; target: number }[] };
    const mapConstToLabel = new Map<number, string>();
    let innerSwitchBlock = -1;
    let tmpSlot = -1;
    const hashBlocks = new Set<number>();
    for (const c of term.cases) {
      if (c.value === null) continue;
      let tb = c.target;
      const seen = new Set<number>();

      while (tb !== innerSwitchBlock) {
        if (seen.has(tb) || this.claimed[tb] || this.absorbed.has(tb) || this.t(tb).t !== 'if')
          return null;
        seen.add(tb);
        const ifTerm = this.t(tb) as { t: 'if'; cond: Expr; jumpB: number; fallB: number };
        let cond = ifTerm.cond;
        const negated = cond.kind === 'unary' && cond.op === '!';
        if (negated && cond.kind === 'unary') cond = cond.operand;
        if (
          cond.kind !== 'invoke' ||
          cond.name !== 'equals' ||
          cond.args.length !== 1 ||
          !cond.target
        )
          return null;
        if (!sameExpr(cond.target, sExpr)) return null;
        const arg = cond.args[0];
        if (
          arg.kind !== 'const' ||
          arg.ctype !== 'string' ||
          strHash(arg.value as string) !== c.value
        )
          return null;
        const matched = negated ? ifTerm.fallB : ifTerm.jumpB;
        const unmatched = negated ? ifTerm.jumpB : ifTerm.fallB;
        const matchedTerm = this.t(matched);
        const nextBlock =
          matchedTerm.t === 'goto'
            ? matchedTerm.target
            : matchedTerm.t === 'none'
              ? this.cfg.blocks[matched].fallthrough
              : -1;
        if (nextBlock < 0) return null;
        const st = this.sim.stmts[matched];
        if (st.length !== 1) return null;
        const a = st[0];
        if (a.kind !== 'expr' || a.expr.kind !== 'assign-expr' || a.expr.target.kind !== 'local')
          return null;
        if (a.expr.expr.kind !== 'const' || a.expr.expr.ctype !== 'int') return null;
        if (tmpSlot === -1) tmpSlot = a.expr.target.slot;
        else if (tmpSlot !== a.expr.target.slot) return null;
        mapConstToLabel.set(a.expr.expr.value as number, arg.value as string);
        if (innerSwitchBlock === -1) innerSwitchBlock = nextBlock;
        else if (innerSwitchBlock !== nextBlock) return null;
        hashBlocks.add(tb);
        hashBlocks.add(matched);
        tb = unmatched;
      }
    }
    if (mapConstToLabel.size === 0 || innerSwitchBlock < 0) return null;
    const dflt = term.cases.find((c) => c.value === null);
    if (!dflt) return null;
    if (dflt.target !== innerSwitchBlock) {
      if (this.t(dflt.target).t === 'goto') {
        if ((this.t(dflt.target) as { t: 'goto'; target: number }).target !== innerSwitchBlock)
          return null;
      } else {
        return null;
      }
    }
    if (this.t(innerSwitchBlock).t !== 'switch') return null;
    const innerTerm = this.t(innerSwitchBlock) as {
      t: 'switch';
      cases: { value: number | null; target: number }[];
    };
    const subj2 = this.switchSubject(innerSwitchBlock);
    if (subj2.kind !== 'local' || subj2.slot !== tmpSlot) return null;

    for (const block of hashBlocks) this.claimed[block] = true;
    this.claimed[b] = true;

    const followNode = this.pickFollow(
      innerSwitchBlock,
      nodes,
      follow,
      innerTerm.cases.map((c) => c.target),
    );
    const brk: Breakable = {
      kind: 'switch',
      exits: new Set([followNode, ...follow]),
      naturalExit: followNode,
      stmt: {},
    };
    const wctx2: WalkCtx = {
      implicitEnds: wctx.implicitEnds,
      breakables: [...wctx.breakables, brk],
    };
    const ordered = [...innerTerm.cases]
      .filter((c) => c.value !== null)
      .sort((x, y) => (x.value as number) - (y.value as number));
    const cases: { labels: (number | string)[]; body: Stmt[]; hasDefault?: boolean }[] = [];
    for (const c of ordered) {
      const label = mapConstToLabel.get(c.value as number);
      if (label === undefined) return null;
      const body = this.caseBody(
        c.target,
        nodes,
        new Set([...follow, ...(followNode >= 0 ? [followNode] : [])]),
        new Set(),
        wctx2,
      );
      cases.push({ labels: [label], body });
    }
    const dflt2 = innerTerm.cases.find((c) => c.value === null);
    if (
      dflt2 &&
      dflt2.target >= 0 &&
      dflt2.target !== followNode &&
      !ordered.some((c) => c.target === dflt2.target)
    ) {
      cases.push({
        labels: [],
        body: this.caseBody(
          dflt2.target,
          nodes,
          new Set([...follow, ...(followNode >= 0 ? [followNode] : [])]),
          new Set(),
          wctx2,
        ),
        hasDefault: true,
      });
    }
    this.claimed[innerSwitchBlock] = true;
    return {
      stmt: { kind: 'switch', subject: sExpr, cases, stringMode: true },
      next: followNode,
    };
  },

  tryEnumSwitch(
    b: number,
    subject: Expr,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
  ): { stmt: Stmt; next: number } | null {
    let enumExpr: Expr | null = null;
    let owner: string | null = null;
    let mapName: string | null = null;
    if (
      subject.kind === 'invoke' &&
      subject.mode === 'static' &&
      subject.name.startsWith('$SWITCH_TABLE$') &&
      subject.args.length === 1 &&
      subject.args[0].kind === 'invoke' &&
      subject.args[0].name === 'ordinal' &&
      subject.args[0].args.length === 0
    ) {
      enumExpr = subject.args[0].target ?? null;
      owner = subject.owner;
      mapName = subject.name;
    } else if (
      subject.kind === 'array-load' &&
      subject.array.kind === 'field-get' &&
      subject.array.name.startsWith('$SwitchMap$') &&
      subject.index.kind === 'invoke' &&
      subject.index.name === 'ordinal' &&
      subject.index.args.length === 0
    ) {
      enumExpr = subject.index.target ?? null;
      owner = subject.array.owner;
      mapName = (subject.array as { name: string }).name;
    }
    if (!enumExpr || !owner || !mapName) return null;
    const ownerCls = this.ctx.lookup(owner);
    if (!ownerCls) return null;
    let enumCls: string | null = null;
    if (mapName.startsWith('$SWITCH_TABLE$')) {
      enumCls = mapName.slice('$SWITCH_TABLE$'.length);
    } else {
      const f = ownerCls.fields.find((x) => x.name === mapName);
      if (f?.name.startsWith('$SwitchMap$')) {
        enumCls = f.name.slice('$SwitchMap$'.length) || null;
      }
    }
    if (!enumCls) return null;
    const enumInfo = this.ctx.lookup(enumCls);
    if (!enumInfo || !(enumInfo.access & 0x4000)) return null;
    const valueToConst = this.buildEnumSwitchMap(ownerCls, mapName, enumCls);
    if (!valueToConst || valueToConst.size === 0) return null;

    const term = this.t(b) as { t: 'switch'; cases: { value: number | null; target: number }[] };
    let patCaseTypes: SwitchLabel[] | null = null;
    for (const ins of this.cfg.blocks[b].instrs) {
      if (ins.op === 0xba) {
        const ct = this.sim.switchCaseTypes?.get(ins.pc);
        if (ct && ct.length) patCaseTypes = ct;
      }
    }
    let followNode: number;
    if (patCaseTypes) {
      const armIds = term.cases
        .map((c) => c.target)
        .filter((a) => a >= 0 && this.cfg.blocks[a].succs.length > 0);
      const reach = armIds.map((a) => this.reachableSet(a));
      followNode = -1;
      if (reach.length) {
        const common = [...reach[0]].filter((x) => reach.every((ss) => ss.has(x)));
        for (const c of common) {
          if (
            nodes.has(c) &&
            !follow.has(c) &&
            !this.claimed[c] &&
            !armIds.includes(c) &&
            !this.isHandlerEntryPc(this.cfg.blocks[c].startPc)
          ) {
            followNode = c;
            break;
          }
        }
      }
      if (followNode === -1)
        followNode = this.pickFollow(
          b,
          nodes,
          follow,
          term.cases.map((c) => c.target),
        );
    } else {
      followNode = this.pickFollow(
        b,
        nodes,
        follow,
        term.cases.map((c) => c.target),
      );
    }
    const brk: Breakable = {
      kind: 'switch',
      exits: new Set([followNode, ...follow]),
      naturalExit: followNode,
      stmt: {},
    };
    const wctx2: WalkCtx = {
      implicitEnds: wctx.implicitEnds,
      breakables: [...wctx.breakables, brk],
    };
    const ordered = [...term.cases]
      .filter((c) => c.value !== null)
      .sort((x, y) => (x.value as number) - (y.value as number));
    const cases: { labels: (number | string)[]; body: Stmt[]; hasDefault?: boolean }[] = [];
    for (const c of ordered) {
      const constName = valueToConst.get(c.value as number);
      if (!constName) return null;
      const body = this.caseBody(
        c.target,
        nodes,
        new Set([...follow, ...(followNode >= 0 ? [followNode] : [])]),
        new Set(),
        wctx2,
      );
      cases.push({ labels: [constName], body });
    }
    const dflt = term.cases.find((c) => c.value === null);
    if (
      dflt &&
      dflt.target >= 0 &&
      dflt.target !== followNode &&
      !ordered.some((c) => c.target === dflt.target)
    ) {
      cases.push({
        labels: [],
        body: this.caseBody(
          dflt.target,
          nodes,
          new Set([...follow, ...(followNode >= 0 ? [followNode] : [])]),
          new Set(),
          wctx2,
        ),
        hasDefault: true,
      });
    }
    return {
      stmt: {
        kind: 'switch',
        subject: enumExpr,
        cases,
        enumMode: {
          enumClass: enumCls,
          labels: ordered.map((c) => valueToConst.get(c.value as number) as string),
        },
      },
      next: followNode,
    };
  },

  buildEnumSwitchMap(
    ownerCls: ClassFile,
    mapName: string,
    enumCls: string,
  ): Map<number, string> | null {
    const out = new Map<number, string>();
    const parseInstrs = (code: Uint8Array): boolean => {
      let ok = false;
      const decoded = decodeOf(code);
      for (let i = 0; i + 3 < decoded.length; i++) {
        const a = decoded[i],
          b2 = decoded[i + 1],
          c = decoded[i + 2],
          d = decoded[i + 3],
          e = decoded[i + 4];
        if (
          a.op === 0xb2 &&
          b2.op === 0xb6 &&
          c.op === 0x5f &&
          isPushConst(d.op) &&
          e?.op === 0x4f
        ) {
          const ref = ownerCls.cp.memberRef(a.cpIndex!);
          if (ref && ref.owner === enumCls && ref.descriptor === `L${enumCls};`) {
            out.set(constValOf(d), ref.name);
            ok = true;
          }
        }
        if (
          a.op === 0xb2 &&
          b2.op === 0xb2 &&
          c.op === 0xb6 &&
          isPushConst(d.op) &&
          e?.op === 0x4f
        ) {
          const ref = ownerCls.cp.memberRef(b2.cpIndex!);
          if (ref && ref.owner === enumCls && ref.descriptor === `L${enumCls};`) {
            out.set(constValOf(d), ref.name);
            ok = true;
          }
        }
      }
      return ok;
    };
    if (mapName.startsWith('$SWITCH_TABLE$')) {
      const m = ownerCls.methods.find((x) => x.name === mapName);
      if (m?.code && parseInstrs(m.code.code)) return out;
      return null;
    }
    const clinit = ownerCls.methods.find((x) => x.name === '<clinit>');
    if (clinit?.code && parseInstrs(clinit.code.code)) return out;
    return null;
  },
};
