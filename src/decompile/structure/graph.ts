import type { Structurer } from './index.js';

export function pickFollow(
  state: Structurer,
  b: number,
  nodes: Set<number>,
  follow: Set<number>,
  arms: number[],
): number {
  if (b < 0) return -1;
  const ipd = state.cfg.ipdom[b];
  if (
    ipd >= 0 &&
    ipd < state.cfg.blocks.length &&
    ipd !== b &&
    !follow.has(ipd) &&
    !state.claimed[ipd] &&
    !state.absorbed.has(ipd)
  ) {
    return ipd;
  }
  if (arms.length >= 2) {
    const succSets = arms.filter((a) => a >= 0).map((a) => new Set(state.cfg.blocks[a].succs));
    const common = [...succSets[0]].filter((x) => succSets.every((ss) => ss.has(x)));
    for (const c of common) {
      if (nodes.has(c) && !follow.has(c) && !state.claimed[c] && !arms.includes(c)) return c;
    }
  }
  return -1;
}

export function reachableSet(state: Structurer, from: number): Set<number> {
  const out = new Set<number>();
  const stack = [...state.cfg.blocks[from].succs];
  let guard = 0;
  while (stack.length && guard++ < 512) {
    const x = stack.pop()!;
    if (x < 0 || out.has(x)) continue;
    out.add(x);
    for (const s of state.cfg.blocks[x].succs) stack.push(s);
  }
  return out;
}

export function reaches(state: Structurer, from: number, to: number, nodes: Set<number>): boolean {
  const seen = new Set<number>();
  const stack = [from];
  while (stack.length) {
    const x = stack.pop()!;
    if (x === to) return true;
    if (seen.has(x) || !nodes.has(x)) continue;
    seen.add(x);
    for (const s of state.cfg.blocks[x].succs) stack.push(s);
  }
  return false;
}

export function blockOfPc(state: Structurer, pc: number): number {
  if (pc < 0 || pc >= state.cfg.blockIndexAt.length) return -1;
  return state.cfg.blockIndexAt[pc];
}

export function handlerOwned(state: Structurer, hb: number, nodes: Set<number>): Set<number> {
  const region = state.dfsCollect(
    hb,
    new Set([hb, ...nodes]),
    new Set<number>(),
    state.claimedSet(),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const block of region) {
      if (block === hb) continue;
      const owned = state.cfg.blocks[block].preds.every(
        (p) =>
          region.has(p) ||
          (state.method.code?.exceptions ?? []).some(
            (ex) =>
              ex.handlerPc === state.cfg.blocks[p].startPc &&
              [...region].some(
                (r) =>
                  state.cfg.blocks[r].startPc >= ex.startPc &&
                  state.cfg.blocks[r].startPc < ex.endPc,
              ),
          ),
      );
      if (!owned) {
        region.delete(block);
        changed = true;
      }
    }
  }
  return region;
}

export function dfsCollect(
  state: Structurer,
  start: number,
  nodes: Set<number>,
  stops: Set<number>,
  initialClaimed: Set<number>,
): Set<number> {
  const out = new Set<number>();
  if (start < 0 || !nodes.has(start) || initialClaimed.has(start)) return out;
  out.add(start);
  const stack: number[] = [];
  for (const s of state.cfg.blocks[start].succs) stack.push(s);
  while (stack.length) {
    const x = stack.pop()!;
    if (x < 0 || out.has(x) || stops.has(x) || !nodes.has(x) || initialClaimed.has(x)) continue;
    out.add(x);
    for (const s of state.cfg.blocks[x].succs) stack.push(s);
  }
  return out;
}
