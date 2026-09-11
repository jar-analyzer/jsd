export function describeClasses(entries, parseClass) {
  return entries.map(([path, bytes]) => {
    if (!/\.class$/i.test(path)) return [path, bytes];
    try {
      const cls = parseClass(bytes);
      const enclosing =
        cls.enclosing?.class ?? cls.innerClasses.find((entry) => entry.inner === cls.name)?.outer;
      return [path, bytes, { name: cls.name, enclosing }];
    } catch {
      return [path, bytes];
    }
  });
}

export function classRoots(files, metadata) {
  const names = new Map();
  const directory = (path) => path.slice(0, path.lastIndexOf('/') + 1);
  for (const path of files.keys()) {
    const info = metadata.get(path);
    if (!info) continue;
    const key = directory(path) + '\0' + info.name;
    names.set(key, names.has(key) ? null : path);
  }
  const parents = new Map();
  for (const path of files.keys()) {
    const enclosing = metadata.get(path)?.enclosing;
    const parent = enclosing && names.get(directory(path) + '\0' + enclosing);
    if (parent && parent !== path) parents.set(path, parent);
  }
  const roots = new Map();
  for (const path of files.keys()) {
    let root = path;
    const seen = new Set();
    while (parents.has(root)) {
      if (seen.has(root)) {
        root = path;
        break;
      }
      seen.add(root);
      root = parents.get(root);
    }
    roots.set(path, root);
  }
  return roots;
}
