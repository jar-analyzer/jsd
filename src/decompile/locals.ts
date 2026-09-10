import type { CFG } from '../bytecode/cfg.js';
import type { Instr } from '../bytecode/decode.js';
import type { MethodInfo } from '../classfile/model.js';
import { parseMethodDescriptor } from '../classfile/types.js';

export function splitLocalSlots(cfg: CFG, method: MethodInfo): number {
  const code = method.code!;
  type State = Map<number, Set<number>>;
  const parent: number[] = [];
  const origin: number[] = [];
  const makeDef = (slot: number): number => {
    const id = parent.length;
    parent.push(id);
    origin.push(slot);
    return id;
  };
  const root = (id: number): number => {
    while (parent[id] !== id) {
      parent[id] = parent[parent[id]];
      id = parent[id];
    }
    return id;
  };
  const merge = (a: number, b: number): void => {
    parent[root(b)] = root(a);
  };
  const initial: State = new Map();
  const seed = (slot: number): void => {
    if (!initial.has(slot)) initial.set(slot, new Set([makeDef(slot)]));
  };
  let parameter = method.access & 0x0008 ? 0 : 1;
  if (parameter) seed(0);
  for (const type of parseMethodDescriptor(method.descriptor).params) {
    seed(parameter);
    parameter += type.kind === 'prim' && (type.name === 'long' || type.name === 'double') ? 2 : 1;
  }
  const accesses = new Map<Instr, { slot: number; reads: boolean; def?: number }>();
  for (const block of cfg.blocks) {
    for (const ins of block.instrs) {
      const match = /^[ialfd](load|store)(?:_(\d))?$/.exec(ins.name);
      if (!match && ins.name !== 'iinc') continue;
      const slot = ins.local ?? Number(match?.[2]);
      seed(slot);
      const reads = ins.name === 'iinc' || match?.[1] === 'load';
      const writes = ins.name === 'iinc' || match?.[1] === 'store';
      accesses.set(ins, { slot, reads, def: writes ? makeDef(slot) : undefined });
    }
  }
  const copy = (state: State): State =>
    new Map([...state].map(([slot, defs]) => [slot, new Set(defs)]));
  const union = (target: State, source: State): void => {
    for (const [slot, defs] of source) {
      let values = target.get(slot);
      if (!values) target.set(slot, (values = new Set()));
      for (const def of defs) values.add(def);
    }
  };
  const equal = (a: State, b: State): boolean =>
    a.size === b.size &&
    [...a].every(([s, ds]) => ds.size === b.get(s)?.size && [...ds].every((d) => b.get(s)!.has(d)));
  const incoming = cfg.blocks.map((): State => new Map());
  const outgoing = cfg.blocks.map((): State => new Map());
  const exceptional = cfg.blocks.map((): State => new Map());
  const handlers = new Map<number, number[]>();
  for (const ex of code.exceptions) {
    const handler = cfg.blockIndexAt[ex.handlerPc];
    if (handler === undefined || handler < 0) continue;
    const preds = handlers.get(handler) ?? [];
    for (const block of cfg.blocks) {
      if (block.instrs.some((ins) => ins.pc >= ex.startPc && ins.pc < ex.endPc))
        preds.push(block.id);
    }
    handlers.set(handler, [...new Set(preds)]);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const block of cfg.blocks) {
      const state: State = new Map();
      if (block.id === cfg.blockIndexAt[0]) union(state, initial);
      for (const pred of block.preds) union(state, outgoing[pred]);
      for (const pred of handlers.get(block.id) ?? []) union(state, exceptional[pred]);
      incoming[block.id] = copy(state);
      const atThrow = copy(state);
      for (const ins of block.instrs) {
        const access = accesses.get(ins);
        if (access?.def !== undefined) {
          state.set(access.slot, new Set([access.def]));
          union(atThrow, state);
        }
      }
      if (!equal(state, outgoing[block.id]) || !equal(atThrow, exceptional[block.id]))
        changed = true;
      outgoing[block.id] = state;
      exceptional[block.id] = atThrow;
    }
  }
  const readDefinitions = new Map<Instr, number>();
  for (const block of cfg.blocks) {
    const state = copy(incoming[block.id]);
    for (const ins of block.instrs) {
      const access = accesses.get(ins);
      if (!access) continue;
      if (access.reads) {
        const defs = [...(state.get(access.slot) ?? initial.get(access.slot) ?? [])];
        if (access.def !== undefined) defs.push(access.def);
        if (defs.length) {
          for (const def of defs.slice(1)) merge(defs[0], def);
          readDefinitions.set(ins, defs[0]);
        }
      }
      if (access.def !== undefined) state.set(access.slot, new Set([access.def]));
    }
  }
  const visible = new Set<number>();
  for (const [ins, access] of accesses) {
    const def = access.def ?? readDefinitions.get(ins);
    const pc = access.reads ? ins.pc : ins.pc + ins.size;
    if (
      def !== undefined &&
      code.localVars.some(
        (entry) =>
          entry.index === access.slot && pc >= entry.start && pc < entry.start + entry.length,
      )
    ) {
      visible.add(root(def));
    }
  }
  const assigned = new Map<number, number>();
  const usedSlots = new Set<number>();
  let paramSlot = method.access & 0x0008 ? 0 : 1;
  if (paramSlot) {
    assigned.set(root(initial.get(0)!.values().next().value!), 0);
    usedSlots.add(0);
  }
  for (const type of parseMethodDescriptor(method.descriptor).params) {
    assigned.set(root(initial.get(paramSlot)!.values().next().value!), paramSlot);
    usedSlots.add(paramSlot);
    paramSlot++;
    if (type.kind === 'prim' && (type.name === 'long' || type.name === 'double'))
      usedSlots.add(paramSlot++);
  }
  let nextSlot = code.maxLocals;
  const slotFor = (def: number): number => {
    const id = root(def);
    let slot = assigned.get(id);
    if (slot === undefined) {
      slot = code.localVars.length
        ? visible.has(id)
          ? origin[id]
          : nextSlot++
        : usedSlots.has(origin[id])
          ? nextSlot++
          : origin[id];
      usedSlots.add(slot);
      assigned.set(id, slot);
    }
    return slot;
  };
  for (const [ins, access] of accesses) {
    const def = access.def ?? readDefinitions.get(ins);
    if (def !== undefined) {
      if (code.typeAnnotations?.length) ins.originalLocal = access.slot;
      ins.local = slotFor(def);
    }
  }
  return nextSlot;
}
