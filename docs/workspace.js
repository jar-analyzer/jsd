export function classFamily(files, path) {
  let root = path;
  const stem = path.replace(/\.class$/i, '');
  for (let index = stem.lastIndexOf('$'); index >= 0; index = stem.lastIndexOf('$', index - 1)) {
    if (index < stem.lastIndexOf('/')) break;
    const candidate = stem.slice(0, index) + '.class';
    if (files.has(candidate)) root = candidate;
    if (index === 0) break;
  }
  const base = root.replace(/\.class$/i, '');
  const directory = root.slice(0, root.lastIndexOf('/') + 1);
  return {
    root,
    files: [...files].filter(
      ([name]) =>
        /\.class$/i.test(name) &&
        name.slice(0, name.lastIndexOf('/') + 1) === directory &&
        (name === root || name.replace(/\.class$/i, '').startsWith(base + '$')),
    ),
  };
}

export class Workspace {
  files = new Map();
  cache = new Map();
  cacheInputs = new Map();
  tabResults = new Map();
  current = null;
  selected = null;
  currentPath = null;
  revision = 0;
  selection = 0;
  archives = new Set();
  tabs = [];

  async expandArchive(path, extract) {
    if (this.archives.has(path)) return false;
    const bytes = this.files.get(path);
    if (!bytes || !/\.(jar|war|zip)$/i.test(path)) return false;
    const ticket = ++this.selection;
    const revision = this.revision;
    const entries = await extract([{ name: path, bytes }]);
    if (ticket !== this.selection || revision !== this.revision) return false;
    const additions = entries.map(([name, data]) => [`${path}/${name}`, data]);
    for (const [name] of additions) {
      if (this.files.has(name)) throw new Error(`DUPLICATE: ${name}`);
    }
    for (const [name, data] of additions) this.files.set(name, data);
    this.archives.add(path);
    return true;
  }

  add(entries) {
    const names = new Set(this.files.keys());
    for (const [name] of entries) {
      if (names.has(name)) throw new Error(`DUPLICATE: ${name}`);
      names.add(name);
    }
    for (const [name, bytes] of entries) this.files.set(name, bytes);
  }

  closeTabs(path, mode = 'current') {
    const index = this.tabs.indexOf(path);
    if (index < 0 && mode !== 'all') return;
    this.cancel();
    const previousTabs = this.tabs;
    const activeIndex = previousTabs.indexOf(this.currentPath);
    this.tabs = this.tabs.filter((name, i) => {
      if (mode === 'all') return false;
      if (mode === 'left') return i >= index;
      if (mode === 'right') return i <= index;
      if (mode === 'others') return name === path;
      return name !== path;
    });
    for (const name of this.tabResults.keys()) {
      if (!this.tabs.includes(name)) this.tabResults.delete(name);
    }
    if (this.tabs.includes(this.currentPath)) return;
    this.currentPath =
      previousTabs.slice(activeIndex + 1).find((name) => this.tabs.includes(name)) ??
      this.tabs.at(-1) ??
      null;
    this.selected = this.currentPath;
    this.current = this.currentPath ? (this.tabResults.get(this.currentPath) ?? null) : null;
  }

  replace(entries) {
    this.files = new Map(entries);
    this.cache.clear();
    this.cacheInputs.clear();
    this.tabResults.clear();
    this.tabs = [];
    this.archives.clear();
    this.current = null;
    this.selected = null;
    this.currentPath = null;
    this.revision++;
    this.selection++;
  }

  cancel() {
    this.selection++;
    this.selected = this.currentPath;
  }

  async select(path, decompile) {
    const ticket = ++this.selection;
    const revision = this.revision;
    this.selected = path;
    const family = classFamily(this.files, path);
    let result = this.cache.get(family.root);
    const inputs = this.cacheInputs.get(family.root);
    if (
      !inputs ||
      inputs.length !== family.files.length ||
      inputs.some(
        ([name, bytes], index) =>
          name !== family.files[index][0] || bytes !== family.files[index][1],
      )
    ) {
      result = null;
    }
    if (!result) {
      const start = performance.now();
      let report;
      try {
        report = await decompile(family.files);
      } catch (error) {
        if (ticket !== this.selection || revision !== this.revision) return null;
        this.selected = this.currentPath;
        throw error;
      }
      if (revision !== this.revision) return null;
      const output = report.sources[0];
      result = {
        name: output?.name ?? family.root.replace(/\.class$/i, ''),
        source: output?.source ?? '',
        status: report.status,
        diagnostics: report.diagnostics,
        classes: report.sources.length,
        ms: performance.now() - start,
      };
      this.cache.set(family.root, result);
      this.cacheInputs.set(family.root, family.files);
    }
    if (ticket !== this.selection) return null;
    if (!this.tabs.includes(path)) this.tabs.push(path);
    this.tabResults.set(path, result);
    this.current = result;
    this.currentPath = path;
    return result;
  }
}
