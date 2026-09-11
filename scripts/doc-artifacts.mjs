import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export function syncDocs(root, check = false) {
  const bundle = readFileSync(join(root, 'dist/jsd.min.js'));
  const bytes = bundle.length;
  const gzipBytes = gzipSync(bundle, { level: 9 }).length;
  const kb = Math.round(bytes / 1000);
  const gzipKb = Math.round(gzipBytes / 1000);
  const replaceOne = (source, pattern, replacement, path) => {
    if ([...source.matchAll(new RegExp(pattern.source, 'g'))].length !== 1)
      throw new Error(`Missing or ambiguous size display in ${path}`);
    return source.replace(pattern, replacement);
  };
  const updates = new Map([['docs/jsd.browser.js', bundle]]);
  for (const [path, pattern, replacement] of [
    [
      'README.md',
      /Single JS file: approximately \d+ KB, or \d+ KB with gzip\./,
      `Single JS file: approximately ${kb} KB, or ${gzipKb} KB with gzip.`,
    ],
    [
      'README.zh-CN.md',
      /单个 JS 文件约 \d+ KB，gzip 后约 \d+ KB。/,
      `单个 JS 文件约 ${kb} KB，gzip 后约 ${gzipKb} KB。`,
    ],
  ]) {
    updates.set(
      path,
      Buffer.from(replaceOne(readFileSync(join(root, path), 'utf8'), pattern, replacement, path)),
    );
  }
  const demo = 'docs/index.html';
  let html = readFileSync(join(root, demo), 'utf8');
  for (const [label, size] of [
    ['bundleLabel', kb],
    ['gzipLabel', gzipKb],
  ]) {
    html = replaceOne(
      html,
      new RegExp(
        `(data-i18n="${label}">[^<]+</span>\\s*<strong>)~\\d+( <small>KB</small></strong>\\s*<small>)\\d+\\.\\d+ MB(</small>)`,
      ),
      (_, start, middle, end) => `${start}~${size}${middle}${(size / 1000).toFixed(3)} MB${end}`,
      demo,
    );
  }
  html = replaceOne(html, /JS ~\d+ KB · gzip ~\d+ KB/, `JS ~${kb} KB · gzip ~${gzipKb} KB`, demo);
  updates.set(demo, Buffer.from(html));
  const stale = [...updates].filter(
    ([path, value]) => !readFileSync(join(root, path)).equals(value),
  );
  if (check && stale.length)
    throw new Error(
      `Outdated documentation or demo bundle: ${stale.map(([path]) => path).join(', ')}. Run npm run sync.`,
    );
  if (!check) for (const [path, value] of stale) writeFileSync(join(root, path), value);
  return { bytes, gzipBytes, kb, gzipKb };
}
