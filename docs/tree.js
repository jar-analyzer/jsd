import { t } from './i18n.js';
import { TreeState } from './tree-state.js';
import { enableTreeKeyboard } from './tree-keyboard.js';

enableTreeKeyboard(document.getElementById('tree'));

const state = new TreeState();
let selectedName;
let archivePaths = new Set();

export function buildTree(files, selected, filter = '', archives = new Set()) {
  selectedName = selected;
  archivePaths = archives;
  const tree = document.getElementById('tree');
  state.scroll.set(state.filter, tree.scrollTop);
  if (!state.update(files, filter)) {
    updateSelection(tree, selected);
    const empty = tree.querySelector('.tree-empty');
    if (empty) empty.textContent = t(files.size ? 'noMatch' : 'emptyTitle');
    return;
  }
  const focused = tree.contains(document.activeElement) ? document.activeElement.dataset : null;
  tree.replaceChildren();
  const root = { dirs: new Map(), files: [] };
  for (const path of files.keys()) {
    if (!filter || path.toLowerCase().includes(filter)) insertPath(root, path.split('/'));
  }
  countClasses(root);
  const fragment = document.createDocumentFragment();
  fragment.__pathPrefix = '';
  renderDirChildren(root, fragment, filter, 0);
  tree.appendChild(fragment);
  if (!tree.children.length) {
    const empty = document.createElement('p');
    empty.className = 'tree-empty';
    empty.textContent = t(files.size ? 'noMatch' : 'emptyTitle');
    tree.appendChild(empty);
  }
  if (focused) {
    const row = [...tree.querySelectorAll('.row')].find((row) =>
      focused.path ? row.dataset.path === focused.path : row.dataset.dir === focused.dir,
    );
    row?.focus({ preventScroll: true });
  }
  tree.scrollTop = state.scroll.get(filter) ?? 0;
}

export function revealArchive(path) {
  state.setOpen(path, true);
  for (const row of document.querySelectorAll('#tree .row[data-dir]')) {
    if (row.dataset.dir !== path) continue;
    row.parentElement.classList.add('open');
    row.setAttribute('aria-expanded', 'true');
  }
}

function updateSelection(tree, selected) {
  for (const row of tree.querySelectorAll('.leaf > .row')) {
    const active = row.dataset.path === selected;
    row.classList.toggle('sel', active);
    if (active) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
  }
}

export function expandTree(open) {
  for (const node of document.querySelectorAll('#tree .node.dir')) {
    const row = node.querySelector('.row');
    state.setOpen(row.dataset.dir, open);
    node.classList.toggle('open', open);
    row.setAttribute('aria-expanded', String(open));
  }
}

export function revealTreePath(path) {
  for (const node of document.querySelectorAll('#tree .node.dir')) {
    const row = node.querySelector('.row');
    if (!path.startsWith(row.dataset.dir + '/')) continue;
    state.setOpen(row.dataset.dir, true);
    node.classList.add('open');
    row.setAttribute('aria-expanded', 'true');
  }
  const row = [...document.querySelectorAll('#tree .leaf > .row')].find(
    (row) => row.dataset.path === path,
  );
  row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function insertPath(node, segs) {
  let cur = node;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!cur.dirs.has(segs[i])) cur.dirs.set(segs[i], { dirs: new Map(), files: [] });
    cur = cur.dirs.get(segs[i]);
  }
  cur.files.push(segs[segs.length - 1]);
}

function countClasses(node) {
  let n = node.files.filter((name) => /\.class$/i.test(name)).length;
  for (const d of node.dirs.values()) n += countClasses(d);
  node.total = n;
  return n;
}

function renderDirChildren(node, parent, filter, depth) {
  const dirEntries = [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, sub] of dirEntries) {
    let target = sub;
    const parts = [name];
    while (
      target.files.length === 0 &&
      target.dirs.size === 1 &&
      !/\.(jar|war|zip)$/i.test(parts.at(-1))
    ) {
      const [n2, sub2] = [...target.dirs.entries()][0];
      if (/\.(jar|war|zip)$/i.test(n2)) break;
      parts.push(n2);
      target = sub2;
    }
    renderDir(parts.join('/'), target, parent, filter, depth);
  }
  for (const fname of node.files.slice().sort()) {
    if (node.dirs.has(fname)) continue;
    const leaf = nodeEl('leaf');
    const row = leaf.querySelector('.row');
    const path = parent.__pathPrefix ? `${parent.__pathPrefix}/${fname}` : fname;
    if (/\.(jar|war|zip)$/i.test(fname)) {
      archiveIcon(row);
      row.querySelector('.caret').classList.remove('leafpad');
      row.setAttribute('aria-expanded', 'false');
    }
    leaf.dataset.path = path;
    row.dataset.path = path;
    row.querySelector('.label').innerHTML = highlightLabel(fname, filter);
    if (selectedName === path) {
      row.classList.add('sel');
      row.setAttribute('aria-current', 'true');
    }
    row.title = path;
    parent.appendChild(leaf);
  }
}

function renderDir(label, sub, parent, filter, depth) {
  const el = nodeEl('dir', label);
  parent.appendChild(el);
  const row = el.querySelector('.row');
  const children = el.querySelector('.children');
  children.__pathPrefix = (parent.__pathPrefix ? parent.__pathPrefix + '/' : '') + label;
  if (archivePaths.has(children.__pathPrefix)) {
    row.dataset.path = children.__pathPrefix;
    archiveIcon(row);
  }

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent =
    sub.total >= 1000 ? (sub.total / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(sub.total);
  row.appendChild(count);

  row.dataset.dir = children.__pathPrefix;
  row.title = children.__pathPrefix;
  const open = state.isOpen(children.__pathPrefix, depth);
  if (open) el.classList.add('open');
  row.setAttribute('aria-expanded', String(open));

  renderDirChildren(sub, children, filter, depth + 1);
  if (!children.children.length) el.style.display = 'none';
}

function archiveIcon(row) {
  const icon = row.querySelector('.icon');
  icon.className = 'icon archive-icon';
  icon.innerHTML =
    '<svg viewBox="0 0 16 16"><path d="M3 1.5h7l3 3v10H3zM10 1.5v3h3M7 2v2m0 1v2m0 1v2m-1 1h2v2H6z"/></svg>';
}

function nodeEl(kind, label = '') {
  const el = document.createElement('div');
  el.className = 'node ' + kind;
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row';
  const isDir = kind === 'dir';
  row.innerHTML =
    `<span aria-hidden="true" class="caret${isDir ? '' : ' leafpad'}"><svg viewBox="0 0 16 16"><path d="m6 4 4 4-4 4"/></svg></span>` +
    `<i aria-hidden="true" class="icon ${isDir ? 'folder-icon' : 'class-icon'}"><svg viewBox="0 0 16 16">${isDir ? '<path d="M1.5 3.5h5l1.5 2h6.5v8h-13z"/>' : '<path d="M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3M9 7v3.5a1.5 1.5 0 0 1-3 0"/>'}</svg></i>` +
    `<span class="label">${label ? label.split('/').map(escapeHtml).join('<span class="path-sep">/</span>') : ''}</span>`;
  el.appendChild(row);
  if (isDir) {
    row.addEventListener('click', () => {
      el.classList.toggle('open');
      const open = el.classList.contains('open');
      state.setOpen(row.dataset.dir, open);
      row.setAttribute('aria-expanded', String(open));
    });
    const children = document.createElement('div');
    children.className = 'children';
    el.appendChild(children);
  }
  return el;
}

const escapeHtml = (t) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function highlightLabel(t, q) {
  const esc = escapeHtml(t);
  if (!q) return esc;
  const i = t.toLowerCase().indexOf(q);
  if (i < 0) return esc;
  return (
    escapeHtml(t.slice(0, i)) +
    '<span class="hl">' +
    escapeHtml(t.slice(i, i + q.length)) +
    '</span>' +
    escapeHtml(t.slice(i + q.length))
  );
}
