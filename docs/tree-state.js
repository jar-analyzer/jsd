export class TreeState {
  files = null;
  size = 0;
  paths = new Set();
  filter = '';
  expanded = new Map();
  searched = new Map();
  scroll = new Map();

  update(files, filter) {
    const replaced = this.files !== files;
    const changed =
      replaced ||
      this.filter !== filter ||
      this.size !== files.size ||
      [...this.paths].some((path) => !files.has(path));
    if (replaced) {
      this.expanded.clear();
      this.scroll.clear();
    }
    if (changed) {
      this.searched.clear();
      this.paths = new Set(files.keys());
    }
    this.files = files;
    this.size = files.size;
    this.filter = filter;
    return changed;
  }

  isOpen(path, depth) {
    return this.filter ? (this.searched.get(path) ?? true) : (this.expanded.get(path) ?? depth < 1);
  }

  setOpen(path, open) {
    (this.filter ? this.searched : this.expanded).set(path, open);
  }
}
