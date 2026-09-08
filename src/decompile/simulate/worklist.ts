import { SimFail } from './result.js';

export function runWorklist(
  initial: readonly number[],
  visit: (block: number) => Iterable<number>,
  budget: number,
): number {
  const queue = [...new Set(initial)];
  const pending = new Set(queue);
  let cursor = 0;
  while (cursor < queue.length) {
    if (cursor >= budget)
      throw new SimFail(`simulation did not converge within ${budget} block evaluations`);
    const block = queue[cursor++];
    pending.delete(block);
    for (const next of visit(block)) {
      if (pending.has(next)) continue;
      pending.add(next);
      queue.push(next);
    }
  }
  return cursor;
}
