import { parentPort } from 'node:worker_threads';
import { decompileClassFile, parseClass } from '../../dist/jsd.min.js';

parentPort.on('message', (bytes) => {
  try {
    parseClass(bytes);
  } catch {
    parentPort.postMessage({ kind: 'rejected' });
    return;
  }
  try {
    const result = decompileClassFile(bytes);
    if (typeof result.source !== 'string' || !result.source.length) throw new Error('empty source');
    if (result.status !== 'success') {
      if (!result.diagnostics.some((d) => d.severity !== 'info'))
        throw new Error('partial source has no diagnostic');
      parentPort.postMessage({ kind: 'degraded' });
    } else parentPort.postMessage({ kind: 'success' });
  } catch (error) {
    parentPort.postMessage({ kind: 'crash', detail: error.stack ?? String(error) });
  }
});
