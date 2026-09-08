import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { classBytes } from './class-builder.js';

test('large maxLocals does not allocate unused slot state across every block', async () => {
  const code: number[] = [];
  for (let i = 0; i < 16; i++) code.push(0x1a, 0x99, 0, 5, 4, 0xac);
  code.push(3, 0xac);
  const bytes = classBytes('SparseLocals', [
    { name: 'value', descriptor: '(I)I', maxLocals: 65535, code },
  ]);
  const { build } = createRequire(resolve('package.json'))('esbuild') as typeof import('esbuild');
  const bundled = await build({
    stdin: {
      contents: `
        import { parentPort, workerData } from 'node:worker_threads';
        import { parseClass } from './src/classfile/parser.ts';
        import { decodeBytecode } from './src/bytecode/decode.ts';
        import { buildCFG } from './src/bytecode/cfg.ts';
        import { splitLocalSlots } from './src/decompile/locals.ts';
        const method = parseClass(workerData).methods[0];
        const cfg = buildCFG(decodeBytecode(method.code.code), new Set());
        const slots = splitLocalSlots(cfg, method);
        parentPort.postMessage({ slots, blocks: cfg.blocks.length });
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
  });
  const worker = new Worker(bundled.outputFiles[0].text, {
    eval: true,
    workerData: bytes,
    resourceLimits: { maxOldGenerationSizeMb: 64 },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await new Promise<{ slots: number; blocks: number }>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('local analysis exceeded five seconds')), 5000);
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) =>
        reject(new Error(`worker exited before returning a result: ${code}`)),
      );
    });
    assert.equal(result.slots, 65535);
    assert.equal(result.blocks, 33);
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
});
