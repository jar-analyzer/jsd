import type { JType } from '../../classfile/types.js';

export interface ScopeContext {
  slotNames: Map<number, string>;
  declared: Set<number>;
  scopes: Map<number, string>[];
  declHistory?: Map<number, string[]>;
  declTypes?: Map<number, JType>;
}

export function declaredNameOf(rc: ScopeContext, slot: number): string | undefined {
  for (let i = rc.scopes.length - 1; i >= 0; i--) {
    const n = rc.scopes[i].get(slot);
    if (n !== undefined) return n;
  }
  return undefined;
}

export function outerNameClash(rc: ScopeContext, slot: number, name: string): boolean {
  for (let i = rc.scopes.length - 1; i >= 0; i--) {
    for (const [s, n] of rc.scopes[i]) {
      if (n === name && s !== slot) return true;
    }
  }
  return false;
}

export function uniqueName(rc: ScopeContext, base: string): string {
  const used = new Set<string>();
  for (const scope of rc.scopes) for (const n of scope.values()) used.add(n);
  for (const names of rc.declHistory?.values() ?? []) for (const n of names) used.add(n);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(base + i)) i++;
  return base + i;
}

export function lookupDeclared(rc: ScopeContext, slot: number): string {
  const strict = declaredNameOf(rc, slot);
  if (strict !== undefined) return strict;
  const hist = rc.declHistory?.get(slot);
  if (hist && hist.length > 0) return hist[hist.length - 1];
  return rc.slotNames.get(slot) ?? `var${slot}`;
}

export function declareSlot(rc: ScopeContext, slot: number, name: string, t?: JType): void {
  rc.scopes[rc.scopes.length - 1].set(slot, name);
  rc.declared.add(slot);
  if (!rc.declHistory) rc.declHistory = new Map();
  if (!rc.declTypes) rc.declTypes = new Map();
  let h = rc.declHistory.get(slot);
  if (!h) rc.declHistory.set(slot, (h = []));
  h.push(name);
  if (t) rc.declTypes.set(slot, t);
}
