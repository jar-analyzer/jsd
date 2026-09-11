import { classRoots } from './class-index.js';

export function classFamily(files, path, metadata = new Map()) {
  const roots = classRoots(files, metadata);
  const root = roots.get(path) ?? path;
  return {
    root,
    files: [...files].filter(([name]) => /\.class$/i.test(name) && roots.get(name) === root),
  };
}

export class Workspace {
  files = new Map();
  classInfo = new Map();
  roots = new Map();
  visibleFiles = new Map();
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
    const additions = entries.map(([name, data, info]) => [`${path}/${name}`, data, info]);
    for (const [name] of additions) {
      if (this.files.has(name)) throw new Error(`DUPLICATE: ${name}`);
    }
    this.add(additions);
    this.archives.add(path);
    return true;
  }

  add(entries) {
    const names = new Set(this.files.keys());
    for (const [name] of entries) {
      if (names.has(name)) throw new Error(`DUPLICATE: ${name}`);
      names.add(name);
    }
    for (const [name, bytes, info] of entries) {
      this.files.set(name, bytes);
      if (info) this.classInfo.set(name, info);
    }
    this.updateVisibleFiles();
  }

  updateVisibleFiles() {
    const roots = classRoots(this.files, this.classInfo);
    this.roots = roots;
    for (const path of this.visibleFiles.keys()) {
      if (!this.files.has(path) || roots.get(path) !== path) this.visibleFiles.delete(path);
    }
    for (const [path, bytes] of this.files) {
      if (roots.get(path) === path) this.visibleFiles.set(path, bytes);
    }
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
    this.visibleFiles = new Map();
    this.files = new Map(entries.map(([path, bytes]) => [path, bytes]));
    this.classInfo = new Map(
      entries.filter(([, , info]) => info).map(([path, , info]) => [path, info]),
    );
    this.updateVisibleFiles();
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
    const family = classFamily(this.files, path, this.classInfo);
    path = family.root;
    this.selected = path;
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
      const name = this.classInfo.get(family.root)?.name;
      const output = report.sources.find((source) => source.name === name) ?? report.sources[0];
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
    const aliases = new Set(family.files.map(([name]) => name));
    this.tabs = [...new Set(this.tabs.map((name) => (aliases.has(name) ? path : name)))];
    for (const name of aliases) if (name !== path) this.tabResults.delete(name);
    if (!this.tabs.includes(path)) this.tabs.push(path);
    this.tabResults.set(path, result);
    this.current = result;
    this.currentPath = path;
    return result;
  }
}
