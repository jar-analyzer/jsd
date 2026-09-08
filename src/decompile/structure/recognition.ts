import type { Structurer } from './index.js';
import { checkpoint } from './checkpoint.js';
import { StructFail } from './types.js';

const immutableInputs = new Set(['ctx', 'cls', 'method', 'cfg']);

export function attemptRecognition<T>(
  state: Structurer,
  inputs: readonly object[],
  recognize: () => T | null,
): T | null {
  const restore = checkpoint([state, ...inputs], new Map([[state, immutableInputs]]));
  try {
    const result = recognize();
    if (result === null) restore();
    return result;
  } catch (error) {
    restore();
    if (error instanceof StructFail) return null;
    throw error;
  }
}
