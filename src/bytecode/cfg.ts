import type { ExceptionEntry } from '../classfile/model.js';
import type { WorkBudget } from '../decompile/budget.js';
import { Instr, branchSuccessors, isConditionalBranch, isSwitch } from './decode.js';

export interface Block {
  id: number;
  startPc: number;
  endPc: number;
  instrs: Instr[];
  succs: number[];
  preds: number[];
  fallthrough: number;
}

export interface CFG {
  blocks: Block[];
  byStart: Map<number, number>;
  blockIndexAt: Int32Array;
  entry: number;
  idom: number[];
  ipdom: number[];
  rpo: number[];
}

export function buildCFG(
  instrs: Instr[],
  handlerPcs: Set<number>,
  exceptionEntries: Set<number> = handlerPcs,
  budget?: WorkBudget,
): CFG {
  budget?.check(instrs.length);
  if (instrs.length === 0) throw new Error('empty method');
  const instructionStarts = new Set(instrs.map((ins) => ins.pc));
  for (const ins of instrs)
    for (const target of branchSuccessors(ins))
      if (!instructionStarts.has(target))
        throw new Error(`invalid branch target ${target} at pc ${ins.pc}`);
  const leaders = new Set<number>();
  leaders.add(instrs[0].pc);
  for (const ins of instrs) {
    const last = ins.pc + ins.size;
    if (isConditionalBranch(ins.op)) {
      leaders.add(ins.branch!);
      leaders.add(last);
    } else if (ins.branch !== undefined && !isConditionalBranch(ins.op) && !isSwitch(ins.op)) {
      leaders.add(ins.branch!);
      leaders.add(last);
    } else if (isSwitch(ins.op)) {
      for (const t of branchSuccessors(ins)) leaders.add(t);
      leaders.add(last);
    } else if (isBlockEnder(ins)) {
      leaders.add(last);
    }
  }
  for (const h of handlerPcs) leaders.add(h);

  const starts = [...leaders].filter((pc) => instructionStarts.has(pc)).sort((a, b) => a - b);
  const blocks: Block[] = [];
  const byStart = new Map<number, number>();
  const blockIndexAt = new Int32Array(
    instrs[instrs.length - 1].pc + instrs[instrs.length - 1].size,
  ).fill(-1);
  let instructionIndex = 0;
  for (let i = 0; i < starts.length; i++) {
    budget?.check(1);
    const start = starts[i];
    const end =
      i + 1 < starts.length
        ? starts[i + 1]
        : instrs[instrs.length - 1].pc + instrs[instrs.length - 1].size;
    const first = instructionIndex;
    while (instructionIndex < instrs.length && instrs[instructionIndex].pc < end)
      instructionIndex++;
    const bl: Block = {
      id: blocks.length,
      startPc: start,
      endPc: end,
      instrs: instrs.slice(first, instructionIndex),
      succs: [],
      preds: [],
      fallthrough: -1,
    };
    for (let pc = start; pc < end; pc++) if (pc < blockIndexAt.length) blockIndexAt[pc] = bl.id;
    blocks.push(bl);
    byStart.set(start, bl.id);
  }
  const blockAt = (pc: number): number => {
    if (pc < 0 || pc >= blockIndexAt.length) return -1;
    return blockIndexAt[pc];
  };

  for (const bl of blocks) {
    const last = bl.instrs[bl.instrs.length - 1];
    const nextPc = last.pc + last.size;
    const next = blockAt(nextPc);
    if (isConditionalBranch(last.op)) {
      bl.succs.push(blockAt(last.branch!), next);
    } else if (last.op === 0xa7 || last.op === 0xc8) {
      bl.succs.push(blockAt(last.branch!));
    } else if (last.op === 0xa8 || last.op === 0xc9) {
      bl.succs.push(blockAt(last.branch!), next);
    } else if (isSwitch(last.op)) {
      for (const t of branchSuccessors(last)) bl.succs.push(blockAt(t));
    } else if (isBlockEnder(last)) {
    } else {
      bl.succs.push(next);
    }
    if (next !== -1 && !isBlockEnder(last)) bl.fallthrough = next;
    bl.succs = [...new Set(bl.succs.filter((x) => x >= 0))];
  }
  for (const bl of blocks) {
    for (const s of bl.succs) blocks[s].preds.push(bl.id);
  }

  const entry = 0;
  const root = blocks.length;
  const entries = new Set([entry, ...[...exceptionEntries].map(blockAt).filter((b) => b >= 0)]);
  const analysisBlocks: Block[] = blocks.map((b) => ({
    ...b,
    preds: [...b.preds, ...(entries.has(b.id) ? [root] : [])],
  }));
  analysisBlocks.push({
    id: root,
    startPc: -1,
    endPc: -1,
    instrs: [],
    succs: [...entries],
    preds: [],
    fallthrough: -1,
  });
  const analysisRpo = computeRPO(analysisBlocks, root, budget);
  const rpo = computeRPO(blocks, entry, budget);
  const normalIdom = computeIdom(blocks, entry, rpo, budget);
  const handlerIdom = computeIdom(analysisBlocks, root, analysisRpo, budget);

  const idom = normalIdom.map((parent, b) =>
    parent >= 0 ? parent : handlerIdom[b] === root ? -1 : handlerIdom[b],
  );
  const ipdom = computeIpdom(blocks, budget);

  return { blocks, byStart, blockIndexAt, entry, idom, ipdom, rpo };
}

function isBlockEnder(ins: Instr): boolean {
  const op = ins.op;
  return (op >= 0xac && op <= 0xb1) || op === 0xbf || op === 0xa9;
}

function computeRPO(blocks: Block[], entry: number, budget?: WorkBudget): number[] {
  const visited = new Set<number>([entry]);
  const order: number[] = [];
  const stack = [{ block: entry, next: 0 }];
  while (stack.length) {
    budget?.check(1);
    const frame = stack[stack.length - 1];
    const successors = blocks[frame.block].succs;
    if (frame.next === successors.length) {
      order.push(frame.block);
      stack.pop();
    } else {
      const next = successors[frame.next++];
      if (!visited.has(next)) {
        visited.add(next);
        stack.push({ block: next, next: 0 });
      }
    }
  }
  order.reverse();
  for (const block of blocks) if (!visited.has(block.id)) order.push(block.id);
  return order;
}

function computeIdom(blocks: Block[], entry: number, rpo: number[], budget?: WorkBudget): number[] {
  const N = blocks.length;
  const idom = new Array<number>(N).fill(-1);
  const rpoIdx = new Array<number>(N).fill(-1);
  rpo.forEach((b, i) => (rpoIdx[b] = i));
  const intersect = (a: number, b: number): number => {
    let x = a,
      y = b;
    while (x !== y) {
      budget?.check(1);
      while (rpoIdx[x] > rpoIdx[y]) {
        budget?.check(1);
        x = idom[x];
      }
      while (rpoIdx[y] > rpoIdx[x]) {
        budget?.check(1);
        y = idom[y];
      }
    }
    return x;
  };
  idom[entry] = entry;
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of rpo) {
      budget?.check(blocks[b].preds.length + 1);
      if (b === entry) continue;
      const preds = blocks[b].preds.filter((p) => idom[p] !== -1);
      if (preds.length === 0) continue;
      let newIdom = preds[0];
      for (const p of preds.slice(1)) {
        if (idom[p] === -1) continue;
        newIdom = intersect(p, newIdom);
      }
      if (idom[b] !== newIdom) {
        idom[b] = newIdom;
        changed = true;
      }
    }
  }
  return idom;
}

function computeIpdom(blocks: Block[], budget?: WorkBudget): number[] {
  const N = blocks.length;
  const rsuccs: number[][] = Array.from({ length: N + 1 }, () => []);
  const exitBound = new Set<number>();
  for (const b of blocks) {
    if (b.succs.length === 0) exitBound.add(b.id);
  }
  if (exitBound.size === 0) exitBound.add(blocks[blocks.length - 1].id);
  for (const e of exitBound) rsuccs[N].push(e);
  for (const b of blocks) {
    for (const s of b.succs) rsuccs[s].push(b.id);
  }
  const post: number[] = [];
  const visited = new Set<number>();
  const stk: { node: number; i: number }[] = [{ node: N, i: 0 }];
  visited.add(N);
  while (stk.length) {
    budget?.check(1);
    const fr = stk[stk.length - 1];
    if (fr.i < rsuccs[fr.node].length) {
      const s = rsuccs[fr.node][fr.i++];
      if (!visited.has(s)) {
        visited.add(s);
        stk.push({ node: s, i: 0 });
      }
    } else {
      post.push(fr.node);
      stk.pop();
    }
  }
  const rpo2 = [...post].reverse();
  const rpoIdx = new Array<number>(N + 1).fill(-1);
  rpo2.forEach((b, i) => (rpoIdx[b] = i));
  const rpreds: number[][] = Array.from({ length: N + 1 }, () => []);
  for (const b of blocks) {
    for (const s of b.succs) rpreds[s].push(b.id);
  }
  const predsOf = (b: number): number[] => {
    const list = b < N ? [...blocks[b].succs] : [];
    if (b < N && exitBound.has(b)) list.push(N);
    return list;
  };
  const idom = new Array<number>(N + 1).fill(-1);
  idom[N] = N;
  const intersect = (a: number, b: number): number => {
    let x = a,
      y = b;
    while (x !== y) {
      budget?.check(1);
      while (rpoIdx[x] > rpoIdx[y]) {
        budget?.check(1);
        x = idom[x];
      }
      while (rpoIdx[y] > rpoIdx[x]) {
        budget?.check(1);
        y = idom[y];
      }
    }
    return x;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of rpo2) {
      budget?.check(1);
      if (b === N) continue;
      const preds = predsOf(b).filter((p) => idom[p] !== -1);
      if (preds.length === 0) continue;
      let newIdom = preds[0];
      for (const p of preds.slice(1)) {
        if (idom[p] === -1) continue;
        newIdom = intersect(p, newIdom);
      }
      if (idom[b] !== newIdom) {
        idom[b] = newIdom;
        changed = true;
      }
    }
  }
  const ipdom = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const d = idom[i];
    ipdom[i] = d === -1 || d === undefined || !visited.has(i) ? -2 : d;
  }
  return ipdom;
}

export function backEdges(cfg: CFG): { src: number; dst: number }[] {
  const out: { src: number; dst: number }[] = [];
  for (const b of cfg.blocks) {
    for (const s of b.succs) {
      if (s === b.id) {
        out.push({ src: b.id, dst: b.id });
      } else if (dominates(cfg, s, b.id)) {
        out.push({ src: b.id, dst: s });
      }
    }
  }
  return out;
}

export function dominates(cfg: CFG, a: number, b: number): boolean {
  let x = b;
  const seen = new Set<number>();
  while (x !== -1 && !seen.has(x)) {
    if (x === a) return true;
    seen.add(x);
    x = cfg.idom[x];
  }
  return false;
}

export function naturalLoop(cfg: CFG, src: number, dst: number): Set<number> {
  const loop = new Set<number>([dst]);
  const stack = [src];
  while (stack.length) {
    const x = stack.pop()!;
    if (loop.has(x)) continue;
    loop.add(x);
    for (const p of cfg.blocks[x].preds) stack.push(p);
  }
  return loop;
}

export function exceptionalLoopCFG(
  cfg: CFG,
  exceptions: ExceptionEntry[],
  budget?: WorkBudget,
): CFG {
  if (!exceptions.length) return cfg;
  const blocks = cfg.blocks.map((block) => ({
    ...block,
    succs: [...block.succs],
    preds: [] as number[],
  }));
  for (const entry of exceptions) {
    const handler = cfg.blockIndexAt[entry.handlerPc];
    for (const block of blocks) {
      budget?.check(1);
      if (
        block.startPc < entry.endPc &&
        block.endPc > entry.startPc &&
        !block.succs.includes(handler)
      )
        block.succs.push(handler);
    }
  }
  for (const block of blocks) for (const next of block.succs) blocks[next].preds.push(block.id);
  const rpo = computeRPO(blocks, cfg.entry, budget);
  return { ...cfg, blocks, rpo, idom: computeIdom(blocks, cfg.entry, rpo, budget) };
}
