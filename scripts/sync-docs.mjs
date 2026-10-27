import { fileURLToPath } from 'node:url';
import { syncDocs } from './doc-artifacts.mjs';

try {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const ignoreGzip = args.includes('--ignore-gzip');
  if (
    args.length > 2 ||
    args.some((arg) => arg !== '--check' && arg !== '--ignore-gzip') ||
    (ignoreGzip && !check)
  )
    throw new Error('Usage: node scripts/sync-docs.mjs [--check [--ignore-gzip]]');
  const sizes = syncDocs(fileURLToPath(new URL('../', import.meta.url)), check, ignoreGzip);
  console.log(
    `Bundle: ${sizes.bytes} bytes; gzip: ${sizes.gzipBytes} bytes; documentation: ${sizes.kb} KB / ${sizes.gzipKb} KB.`,
  );
} catch (error) {
  console.error(
    error.code ? `Documentation synchronization failed (${error.code}).` : error.message,
  );
  process.exitCode = 1;
}
