import { fileURLToPath } from 'node:url';
import { syncDocs } from './doc-artifacts.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg !== '--check'))
    throw new Error('Usage: node scripts/sync-docs.mjs [--check]');
  const sizes = syncDocs(fileURLToPath(new URL('../', import.meta.url)), args.includes('--check'));
  console.log(
    `Bundle: ${sizes.bytes} bytes; gzip: ${sizes.gzipBytes} bytes; documentation: ${sizes.kb} KB / ${sizes.gzipKb} KB.`,
  );
} catch (error) {
  console.error(
    error.code ? `Documentation synchronization failed (${error.code}).` : error.message,
  );
  process.exitCode = 1;
}
