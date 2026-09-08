import * as graph from './graph.js';
import type { StructureOperations } from './operations.js';
import { Stmt } from '../../ast/ast.js';
import { backEdges, naturalLoop } from '../../bytecode/cfg.js';
import type { CFG } from '../../bytecode/cfg.js';
import type { ClassFile, MethodInfo } from '../../classfile/model.js';
import { Ctx } from '../context.js';
import type { SimResult, Terminator } from '../simulate/index.js';
import { StructFail, RangeGroup, LoopInfo, WalkCtx, StructureOutput } from './types.js';
import type { Breakable } from './types.js';
import { stripMonitorExits } from './stmtstrip.js';
import { ifPart } from './if.js';
import { switchPart } from './switch.js';
import { loopPart } from './loop.js';
import { tryPart } from './try.js';
import { syncPart } from './sync.js';

export { StructFail, StructureOutput } from './types.js';
export { negate, strHash } from './conditions.js';
export type { RangeGroup, LoopInfo, WalkCtx, Breakable } from './types.js';

export class Structurer {
  claimed: boolean[] = [];
  loops = new Map<number, LoopInfo>();
  rangeGroups: RangeGroup[] = [];
  rangeByStart = new Map<number, RangeGroup[]>();
  structuredLoops = new Set<number>();
  consumedHandlerPcs = new Set<number>();
  syncHandlers = new Map<number, number>();
  usedLabels = 0;
  pendingMonitors: { arr: Stmt[]; slot: number; used: boolean }[] = [];
  syncLockSlots = new Set<number>();
  absorbed = new Set<number>();
  switchSubjects = new Map<number, import('../../ast/ast.js').Expr>();

  constructor(
    readonly ctx: Ctx,
    readonly cls: ClassFile,
    readonly method: MethodInfo,
    readonly cfg: CFG,
    readonly sim: SimResult,
  ) {
    for (const be of backEdges(cfg)) {
      const info = this.loops.get(be.dst);
      const blocks = naturalLoop(cfg, be.src, be.dst);
      if (info) {
        info.blocks = new Set([...info.blocks, ...blocks]);
        info.backSrcs.push(be.src);
      } else {
        this.loops.set(be.dst, { header: be.dst, blocks, backSrcs: [be.src] });
      }
    }
    const map = new Map<string, RangeGroup>();
    for (const ex of method.code?.exceptions ?? []) {
      const key = `${ex.startPc}:${ex.endPc}`;
      let g = map.get(key);
      if (!g) map.set(key, (g = new RangeGroup(ex.startPc, ex.endPc, [])));
      g.handlers.push(ex);
    }
    this.rangeGroups = [...map.values()].sort((a, b) => b.end - b.start - (a.end - a.start));
    for (const g of this.rangeGroups) {
      let list = this.rangeByStart.get(g.start);
      if (!list) this.rangeByStart.set(g.start, (list = []));
      list.push(g);
    }
  }

  run(): StructureOutput {
    try {
      const nodes = this.allNodes();
      let stmts = this.walk(this.cfg.entry, nodes, new Set(), {
        implicitEnds: new Set(),
        breakables: [],
      });
      const reach = this.dfsCollect(this.cfg.entry, nodes, new Set(), new Set());
      const missing = [...reach].filter(
        (b) => !this.claimed[b] && !this.absorbed.has(b) && !this.isHandlerEntry(b),
      );
      if (missing.length) {
        const detail = missing
          .map((m) => {
            const bb = this.cfg.blocks[m];
            return `B${m}@${bb.startPc}[succs=${bb.succs},preds=${bb.preds}]`;
          })
          .join(' ');
        throw new StructFail(`blocks not structured: ${detail}`);
      }
      if (this.syncLockSlots.size) {
        for (const slot of this.syncLockSlots) stmts = stripMonitorExits(stmts, slot);
      }
      return { stmts };
    } catch (e) {
      if (e instanceof StructFail) return { stmts: [], failed: e.message };
      throw e;
    }
  }

  isHandlerEntry(b: number): boolean {
    const pc = this.cfg.blocks[b].startPc;
    return (this.method.code?.exceptions ?? []).some(
      (e) => e.handlerPc === pc && this.consumedHandlerPcs.has(pc),
    );
  }

  isHandlerEntryPc(pc: number): boolean {
    return (this.method.code?.exceptions ?? []).some((e) => e.handlerPc === pc);
  }

  allNodes(): Set<number> {
    return new Set(this.cfg.blocks.map((b) => b.id));
  }

  t(b: number): Terminator {
    return this.sim.terms[b];
  }

  walk(entry: number, nodes: Set<number>, follow: Set<number>, wctx: WalkCtx): Stmt[] {
    const stmts: Stmt[] = [];
    let cur = entry;
    let steps = 0;
    const maxSteps = this.cfg.blocks.length * 6 + 128;
    const claimedBefore = new Set<number>();
    for (let i = 0; i < this.claimed.length; i++) if (this.claimed[i]) claimedBefore.add(i);
    while (cur !== -1) {
      if (++steps > maxSteps) throw new StructFail('walk did not terminate');
      if (this.claimed[cur]) {
        if (claimedBefore.has(cur)) {
          this.edgeToTarget(cur, stmts, wctx);
        }
        break;
      }
      if (!nodes.has(cur)) break;

      const curBlk = this.cfg.blocks[cur];
      let groups = this.rangeByStart
        .get(curBlk.startPc)
        ?.filter(
          (g) =>
            !g.done &&
            g.handlers.some(
              (h) =>
                !this.consumedHandlerPcs.has(h.handlerPc) || this.syncHandlers.has(h.handlerPc),
            ),
        );
      if (!groups || !groups.length) {
        const inBlock = this.rangeGroups.filter(
          (g) =>
            !g.done &&
            g.start > curBlk.startPc &&
            g.start < curBlk.endPc &&
            g.handlers.some(
              (h) =>
                !this.consumedHandlerPcs.has(h.handlerPc) || this.syncHandlers.has(h.handlerPc),
            ),
        );
        if (inBlock.length) {
          inBlock.sort((a, b) => a.start - b.start);
          groups = [inBlock[0]];
          this.claimed[cur] = true;
          const before = this.sim.stmts[cur].filter((s) => s);
          stmts.push(...before);
          this.sim.stmts[cur] = [];
        }
      }
      if (groups && groups.length) {
        cur = this.handleTry(groups[0], cur, nodes, follow, wctx, stmts);
        continue;
      }

      const loop = this.loopFor(cur);
      if (loop) {
        cur = this.handleLoop(loop, cur, nodes, follow, wctx, stmts);
        continue;
      }

      this.claimed[cur] = true;
      const term = this.t(cur);
      if (term.t === 'if') {
        const boolRegion = this.tryBoolValueRegion(cur);
        if (boolRegion) {
          stmts.push({
            kind: 'expr',
            expr: {
              kind: 'assign-expr',
              target: { kind: 'local', slot: boolRegion.slot, name: boolRegion.name },
              expr: boolRegion.expr,
            },
          });
          const after = this.cfg.ipdom[cur];
          if (after >= 0 && after < this.cfg.blocks.length && !this.claimed[after]) {
            stmts.push(...this.walk(after, nodes, follow, wctx));
          }
          return stmts;
        }
      }
      const pushed = this.sim.stmts[cur];
      stmts.push(...pushed);
      {
        const last = stmts[stmts.length - 1];
        if (
          stmts.length >= 1 &&
          last.kind === 'expr' &&
          (last.expr as { kind?: string }).kind === 'monitor' &&
          (last.expr as unknown as { expr: { kind?: string; slot?: number } }).expr?.kind ===
            'local'
        ) {
          const mslot = (last.expr as unknown as { expr: { slot: number } }).expr.slot;
          this.pendingMonitors.push({ arr: stmts, slot: mslot, used: false });
        }
      }

      switch (term.t) {
        case 'return':
          stmts.push(term.expr ? { kind: 'return', expr: term.expr } : { kind: 'return' });
          return stmts;
        case 'throw':
          stmts.push({ kind: 'throw', expr: term.expr });
          return stmts;
        case 'goto': {
          const tgt = term.target;
          if (follow.has(tgt) || !nodes.has(tgt) || this.claimed[tgt]) {
            this.endEdge(stmts, cur, tgt, wctx, true);
            return stmts;
          }
          cur = tgt;
          continue;
        }
        case 'if': {
          cur = this.emitIf(cur, nodes, follow, wctx, stmts);
          continue;
        }
        case 'switch': {
          cur = this.handleSwitch(cur, nodes, follow, wctx, stmts);
          continue;
        }
        default: {
          const ft = this.cfg.blocks[cur].fallthrough;
          if (ft === -1 || !nodes.has(ft) || follow.has(ft) || this.claimed[ft]) {
            this.endEdge(stmts, cur, ft, wctx, false);
            return stmts;
          }
          cur = ft;
          continue;
        }
      }
    }
    return stmts;
  }

  loopFor(cur: number): LoopInfo | null {
    for (const info of this.loops.values()) {
      if (
        info.blocks.has(cur) &&
        !this.claimed[info.header] &&
        !this.structuredLoops.has(info.header)
      ) {
        return info;
      }
    }
    return null;
  }

  edgeToTarget(target: number, stmts: Stmt[], wctx: WalkCtx): void {
    for (let i = wctx.breakables.length - 1; i >= 0; i--) {
      const br = wctx.breakables[i];
      if (br.kind === 'loop' && br.continueTargets?.has(target)) {
        this.emitJump('continue', stmts, br, wctx, i);
        return;
      }
    }
    const bi = this.breakFor(target, wctx);
    if (bi >= 0) {
      this.emitJump('break', stmts, wctx.breakables[bi], wctx, bi);
      return;
    }
    throw new StructFail(`unstructured jump to B${target}`);
  }

  endEdge(stmts: Stmt[], from: number, to: number, wctx: WalkCtx, viaGoto: boolean): void {
    if (wctx.implicitEnds.has(`${from}->${to}`)) return;
    for (let i = wctx.breakables.length - 1; i >= 0; i--) {
      const br = wctx.breakables[i];
      if (br.kind === 'loop' && br.continueTargets?.has(to)) {
        if (viaGoto) this.emitJump('continue', stmts, br, wctx, i);
        return;
      }
    }
    const bi = this.breakFor(to, wctx);
    if (bi >= 0) {
      this.emitJump('break', stmts, wctx.breakables[bi], wctx, bi);
    }
  }

  breakFor(t: number, wctx: WalkCtx): number {
    for (let i = wctx.breakables.length - 1; i >= 0; i--) {
      const br = wctx.breakables[i];
      if (br.exits.has(t) && (br.naturalExit === t || br.naturalExit === -1)) return i;
    }
    return -1;
  }

  emitJump(
    kind: 'break' | 'continue',
    stmts: Stmt[],
    br: Breakable,
    wctx: WalkCtx,
    idx: number,
  ): void {
    if (idx === wctx.breakables.length - 1) {
      stmts.push({ kind });
    } else {
      if (!br.label) br.label = `L${++this.usedLabels}`;
      br.stmt.label = br.label;
      stmts.push({ kind, label: br.label });
    }
  }

  claimedSet(): Set<number> {
    const s = new Set<number>();
    this.claimed.forEach((c, i) => {
      if (c) s.add(i);
    });
    for (const a of this.absorbed) s.add(a);
    return s;
  }

  pickFollow(b: number, nodes: Set<number>, follow: Set<number>, arms: number[]): number {
    return graph.pickFollow(this, b, nodes, follow, arms);
  }
  reachableSet(from: number): Set<number> {
    return graph.reachableSet(this, from);
  }
  reaches(from: number, to: number, nodes: Set<number>): boolean {
    return graph.reaches(this, from, to, nodes);
  }
  blockOfPc(pc: number): number {
    return graph.blockOfPc(this, pc);
  }
  handlerOwned(hb: number, nodes: Set<number>): Set<number> {
    return graph.handlerOwned(this, hb, nodes);
  }
  dfsCollect(
    start: number,
    nodes: Set<number>,
    stops: Set<number>,
    initialClaimed: Set<number>,
  ): Set<number> {
    return graph.dfsCollect(this, start, nodes, stops, initialClaimed);
  }

  captureSwitchSubject(b: number, e: import('../../ast/ast.js').Expr): void {
    this.switchSubjects.set(b, e);
  }

  switchSubject(b: number): import('../../ast/ast.js').Expr {
    const sv = this.switchSubjects.get(b) ?? this.sim.switchSubjects.get(b);
    if (!sv) throw new StructFail('missing switch subject');
    return sv;
  }
}

export interface Structurer extends StructureOperations {}

Object.assign(Structurer.prototype, ifPart, switchPart, loopPart, tryPart, syncPart);
