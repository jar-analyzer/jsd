import { attemptRecognition } from './recognition.js';
import { recoverResources } from './resources.js';
import { Stmt } from '../../ast/ast.js';
import { StructFail } from './types.js';
import type { RangeGroup, WalkCtx } from './types.js';
import { stripMonitorExits } from './stmtstrip.js';
import type { Structurer } from './index.js';

export const tryPart: ThisType<Structurer> &
  Pick<
    Structurer,
    'handleTry' | 'detectMatchGuard' | 'consumeGroup' | 'handlerChain' | 'mergeSequentialRanges'
  > = {
  handleTry(
    group: RangeGroup,
    entryBlock: number,
    nodes: Set<number>,
    follow: Set<number>,
    wctx: WalkCtx,
    stmts: Stmt[],
  ): number {
    group.done = true;
    const myHandlerPcs = new Set(group.handlers.map((x) => x.handlerPc));
    const handlerRegionBlocks = new Set<number>();
    for (const h of group.handlers) {
      const hblk = this.blockOfPc(h.handlerPc);
      if (hblk >= 0) {
        for (const x of this.dfsCollect(
          hblk,
          this.allNodes(),
          new Set<number>(),
          new Set<number>(),
        )) {
          handlerRegionBlocks.add(x);
        }
      }
    }
    for (const g2 of this.rangeGroups) {
      if (g2 === group || g2.done) continue;
      if (g2.handlers.length > 0 && g2.handlers.every((x) => myHandlerPcs.has(x.handlerPc))) {
        const g2Start = this.blockOfPc(g2.start);
        const inside = g2.start >= group.start && g2.end <= group.end;
        const inHandlerRegion = g2Start >= 0 && handlerRegionBlocks.has(g2Start);
        if (inside || inHandlerRegion) {
          g2.done = true;
          for (const x of g2.handlers) {
            g2.consumedHandlers.add(x.handlerPc);
            this.consumedHandlerPcs.add(x.handlerPc);
          }
        }
      }
    }
    const resource = recoverResources(this, group, nodes, stmts, wctx);
    if (resource) {
      stmts.push(resource.stmt);
      return resource.next >= 0 && !this.claimed[resource.next] ? resource.next : -1;
    }
    attemptRecognition(this, [group, stmts, wctx], () => this.detectSync(group, stmts) || null);
    this.detectFinally(group);
    if (!group.isSync && !group.finallyBody) this.mergeSequentialRanges(group);
    const matchGuard = this.detectMatchGuard(group);

    const bodyBlocks = new Set<number>();
    if (group.finallyBody && !group.isSync) {
      const fh = group.handlers.find((h) => group.consumedHandlers.has(h.handlerPc));
      const limit = fh ? fh.handlerPc : group.end;
      for (const b of nodes) {
        if (this.claimed[b]) continue;
        const pc = this.cfg.blocks[b].startPc;
        if (pc >= group.start && pc < limit && !this.isHandlerEntryPc(pc)) bodyBlocks.add(b);
      }
    }
    for (const b of nodes) {
      const pc = this.cfg.blocks[b].startPc;
      if (pc >= group.start && pc < group.end && !this.claimed[b]) bodyBlocks.add(b);
    }
    if (bodyBlocks.size === 0) {
      const ft = this.cfg.blocks[entryBlock].fallthrough;
      this.claimed[entryBlock] = true;
      stmts.push(...this.sim.stmts[entryBlock]);
      return ft;
    }

    const tryExits = new Set<number>();
    const handlerBlocksAll = new Set<number>();
    for (const b of bodyBlocks) {
      for (const sc of this.cfg.blocks[b].succs) {
        if (!bodyBlocks.has(sc) && nodes.has(sc)) tryExits.add(sc);
      }
    }
    for (const h of group.handlers) {
      if (group.consumedHandlers.has(h.handlerPc)) continue;
      const hb0 = this.blockOfPc(h.handlerPc);
      if (hb0 < 0 || this.claimed[hb0]) continue;
      const domRegion = this.handlerOwned(hb0, nodes);
      for (const x of domRegion) {
        handlerBlocksAll.add(x);
        for (const sc of this.cfg.blocks[x].succs) {
          if (!domRegion.has(sc) && !bodyBlocks.has(sc) && nodes.has(sc)) tryExits.add(sc);
        }
      }
    }
    const tryFollow = new Set<number>([...tryExits, ...follow]);
    void handlerBlocksAll;

    let body: Stmt[];
    if (group.isSync) {
      const entry = [...bodyBlocks].sort(
        (a, b) => this.cfg.blocks[a].startPc - this.cfg.blocks[b].startPc,
      )[0];
      if (group.monitorSlot === undefined) throw new StructFail('synchronized entry not found');
      body = this.walk(entry, bodyBlocks, new Set([...tryFollow]), wctx);
      body = stripMonitorExits(body, group.monitorSlot);
      const syncCatches: {
        type: string | null;
        body: Stmt[];
        varName?: string;
        varSlot?: number;
      }[] = [];
      for (const h of group.handlers) {
        if (group.consumedHandlers.has(h.handlerPc) || h.catchType === null) continue;
        const hb = this.blockOfPc(h.handlerPc);
        if (hb < 0 || this.claimed[hb]) continue;
        const hst = this.sim.stmts[hb];
        let varName: string | undefined;
        let varSlot: number | undefined;
        if (
          hst.length &&
          hst[0].kind === 'expr' &&
          hst[0].expr.kind === 'assign-expr' &&
          hst[0].expr.target.kind === 'local' &&
          (hst[0].expr.expr as { text?: string }).text === '@exception'
        ) {
          varSlot = (hst[0].expr.target as { slot: number }).slot;
          varName = (hst[0].expr.target as { name: string }).name;
          hst.shift();
        }
        const handlerSet = this.handlerOwned(hb, nodes);
        const hBody = this.walk(hb, handlerSet, new Set([...tryFollow]), wctx);
        syncCatches.push({ type: h.catchType, body: hBody, varName, varSlot });
      }
      if (syncCatches.length) body = [{ kind: 'try', body, catches: syncCatches }];
      this.consumeGroup(group, nodes);
      const anyH = group.handlers.find(
        (h) => group.consumedHandlers.has(h.handlerPc) && h.catchType === null,
      );
      const hst = anyH ? (this.sim.stmts[this.blockOfPc(anyH.handlerPc)] ?? []) : [];
      const ex0 = hst.find(
        (x) =>
          x.kind === 'expr' &&
          x.expr.kind === 'assign-expr' &&
          (x.expr.expr as { text?: string }).text === '@exception',
      );
      const cleanup = hst
        .filter((x) => x !== ex0 && !(x.kind === 'expr' && x.expr.kind === 'monitor'))
        .map((x) => ({ ...x }));
      if (ex0 && cleanup.length) {
        const exSlot = (ex0 as { expr: { target: { slot: number } } }).expr.target.slot;
        const exName = (ex0 as { expr: { target: { name: string } } }).expr.target.name;
        cleanup.push({ kind: 'throw', expr: { kind: 'local', slot: exSlot, name: exName } });
        stmts.push({ kind: 'sync', monitor: group.monitorExpr!, body });
        stmts.push({
          kind: 'try',
          body: [],
          catches: [
            { type: 'java/lang/Throwable', varName: exName, varSlot: exSlot, body: cleanup },
          ],
        });
      } else {
        stmts.push({ kind: 'sync', monitor: group.monitorExpr!, body });
      }
      const followNode = this.pickFollow(entryBlock, nodes, follow, [...bodyBlocks]);
      return followNode === -1 && tryExits.size > 0
        ? [...tryExits].sort((a, b) => this.cfg.blocks[a].startPc - this.cfg.blocks[b].startPc)[0]
        : followNode;
    }

    body = this.walk(entryBlock, bodyBlocks, new Set([...tryFollow]), wctx);

    const catches: {
      type: string | null;
      body: Stmt[];
      varName?: string;
      varSlot?: number;
      extraTypes?: string[];
    }[] = [];
    const seenHandlerPc = new Set<number>();
    for (const h of group.handlers) {
      if (group.consumedHandlers.has(h.handlerPc)) continue;
      const hb = this.blockOfPc(h.handlerPc);
      if (hb < 0) continue;
      if (seenHandlerPc.has(h.handlerPc) || this.claimed[hb]) {
        const lastC = catches[catches.length - 1];
        if (
          lastC &&
          lastC.extraTypes &&
          h.catchType &&
          lastC.type !== h.catchType &&
          !lastC.extraTypes.includes(h.catchType)
        ) {
          lastC.extraTypes.push(h.catchType);
        }
        continue;
      }
      seenHandlerPc.add(h.handlerPc);
      let varName: string | undefined;
      let varSlot: number | undefined;
      const hst = this.sim.stmts[hb];
      if (
        hst.length &&
        hst[0].kind === 'expr' &&
        hst[0].expr.kind === 'assign-expr' &&
        hst[0].expr.target.kind === 'local' &&
        (hst[0].expr.expr as { text?: string }).text === '@exception'
      ) {
        varSlot = (hst[0].expr.target as { slot: number }).slot;
        varName = (hst[0].expr.target as { name: string }).name;
        hst.shift();
      }
      const handlerSet = this.handlerOwned(hb, nodes);
      const hBody = this.walk(hb, handlerSet, new Set([...tryFollow]), wctx);
      catches.push({ type: h.catchType, body: hBody, varName, varSlot, extraTypes: [] });
    }

    if (matchGuard) {
      stmts.push(...body);
      let fNode = this.pickFollow(entryBlock, nodes, follow, [...bodyBlocks]);
      if (fNode === -1 || !nodes.has(fNode)) {
        const sortedExits2 = [...tryExits].sort(
          (a, b) => this.cfg.blocks[a].startPc - this.cfg.blocks[b].startPc,
        );
        fNode = sortedExits2.find((x) => !this.claimed[x] && nodes.has(x)) ?? -1;
      }
      return fNode;
    }
    const tryStmt: Stmt = { kind: 'try', body, catches };
    if (group.finallyBody) (tryStmt as { finallyS?: Stmt[] }).finallyS = group.finallyBody;
    stmts.push(tryStmt);
    let followNode = this.pickFollow(entryBlock, nodes, follow, [...bodyBlocks]);
    const needFallback = followNode === -1 || !nodes.has(followNode);
    this.consumeGroup(group, nodes);
    if (needFallback) {
      const sortedExits = [...tryExits].sort(
        (a, b) => this.cfg.blocks[a].startPc - this.cfg.blocks[b].startPc,
      );
      followNode = sortedExits.find((x) => !this.claimed[x] && nodes.has(x)) ?? -1;
    }
    return followNode;
  },

  detectMatchGuard(group: RangeGroup): boolean {
    const unique = new Set(group.handlers.map((x) => x.handlerPc));
    if (unique.size !== 1) return false;
    const h = group.handlers[0];
    if (h.catchType !== null && h.catchType !== 'java/lang/Throwable') return false;
    const hb = this.blockOfPc(h.handlerPc);
    if (hb < 0 || this.claimed[hb]) return false;
    const chain = this.handlerChain(hb);
    if (!chain || chain.stmts.length !== 1) return false;
    const s0 = chain.stmts[0];
    if (!(
      s0.kind === 'expr' &&
      s0.expr.kind === 'assign-expr' &&
      s0.expr.target.kind === 'local' &&
      (s0.expr.expr as { text?: string }).text === '@exception'
    ))
      return false;
    const end = this.t(chain.endBlock);
    if (
      end.t !== 'throw' ||
      end.expr.kind !== 'new' ||
      end.expr.owner !== 'java/lang/MatchException'
    )
      return false;
    for (const x of chain.stmts) {
      if (x.kind !== 'expr' || x.expr.kind !== 'assign-expr') return false;
    }
    group.consumedHandlers.add(h.handlerPc);
    this.consumedHandlerPcs.add(h.handlerPc);
    this.claimed[hb] = true;
    const region = this.dfsCollect(hb, this.allNodes(), new Set<number>(), this.claimedSet());
    for (const x of region) this.claimed[x] = true;
    for (const g2 of this.rangeGroups) {
      for (const h2 of g2.handlers) {
        if (this.consumedHandlerPcs.has(h2.handlerPc)) g2.consumedHandlers.add(h2.handlerPc);
      }
    }
    return true;
  },

  consumeGroup(group: RangeGroup, nodes: Set<number>): void {
    for (const h of group.handlers) {
      this.consumedHandlerPcs.add(h.handlerPc);
      const hb = this.blockOfPc(h.handlerPc);
      if (hb >= 0) {
        this.claimed[hb] = true;
        const set = this.dfsCollect(hb, nodes, new Set<number>(), this.claimedSet());
        for (const x of set) this.claimed[x] = true;
      }
    }
    for (const g2 of this.rangeGroups) {
      for (const h of g2.handlers) {
        if (this.consumedHandlerPcs.has(h.handlerPc)) g2.consumedHandlers.add(h.handlerPc);
      }
    }
  },

  handlerChain(hb: number): { stmts: Stmt[]; endBlock: number } | null {
    const all: Stmt[] = [...this.sim.stmts[hb]];
    let cur = hb;
    let guard = 0;
    let gotoFollows = 0;
    for (;;) {
      const term = this.t(cur);
      if (term.t === 'none') {
        const bb = this.cfg.blocks[cur];
        if (bb.succs.length !== 1) return null;
        const ft = bb.succs[0];
        if (ft === -1 || this.claimed[ft]) return null;
        all.push(...this.sim.stmts[ft]);
        cur = ft;
      } else if (term.t === 'goto' && gotoFollows < 2) {
        const tt = (term as { target: number }).target;
        if (tt === -1 || this.claimed[tt]) return null;
        all.push(...this.sim.stmts[tt]);
        cur = tt;
        gotoFollows++;
      } else {
        break;
      }
      if (++guard > 40) return null;
    }
    return { stmts: all, endBlock: cur };
  },

  mergeSequentialRanges(group: RangeGroup): void {
    const mine = new Set(group.handlers.map((h) => h.handlerPc));
    const candidates = [...this.rangeGroups].sort((a, b) => a.start - b.start);
    for (const g2 of candidates) {
      if (g2 === group || g2.done) continue;
      if (g2.start < group.end) continue;
      if (g2.handlers.length === 0 || !g2.handlers.every((h2) => mine.has(h2.handlerPc))) continue;
      group.end = Math.max(group.end, g2.end);
      g2.done = true;
      for (const h2 of g2.handlers) {
        g2.consumedHandlers.add(h2.handlerPc);
        if (!group.handlers.includes(h2)) group.handlers.push(h2);
      }
    }
  },
};
