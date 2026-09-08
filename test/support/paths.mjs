import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));

export function listFiles(dir, suffix) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(path);
  }
  return files.sort();
}

export function javaCases(group) {
  if (!['core', 'modern'].includes(group)) throw new Error(`Unknown Java fixture group: ${group}`);
  const dir = join(root, 'test/roundtrip/fixtures', group);
  return listFiles(dir, '.java').map((path) => {
    const id = relative(dir, path)
      .replaceAll('\\', '/')
      .replace(/\.java$/, '');
    const configPath = path.replace(/\.java$/, '.config.json');
    const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
    return {
      id,
      path,
      name: basename(path, '.java'),
      directory: join(path, '..'),
      release: group === 'modern' ? Number(/^java(\d+)\//.exec(id)?.[1]) : undefined,
      ...config,
    };
  });
}

export function filterCases(cases, filters) {
  return cases.filter(
    ({ id }) =>
      !filters.length || filters.some((filter) => id.toLowerCase().includes(filter.toLowerCase())),
  );
}
