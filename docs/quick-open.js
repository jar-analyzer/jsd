import { t } from './i18n.js';
import { matchFiles } from './search-model.js';

export function setupQuickOpen(getFiles, choose) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('quickOpen');
  const input = $('quickInput');
  const list = $('quickResults');
  let items = [];
  let current = 0;
  let previousFocus;
  function select(index) {
    current = items.length ? (index + items.length) % items.length : 0;
    for (const [i, row] of [...list.children].entries())
      row.setAttribute('aria-selected', String(i === current));
    if (items.length) input.setAttribute('aria-activedescendant', `quick-${current}`);
    else input.removeAttribute('aria-activedescendant');
    list.children[current]?.scrollIntoView({ block: 'nearest' });
  }
  function render() {
    const result = matchFiles(getFiles().keys(), input.value);
    items = result.items;
    list.replaceChildren();
    $('quickCount').textContent = t(result.total > items.length ? 'showingFiles' : 'fileMatches', {
      n: result.total,
      shown: items.length,
    });
    $('quickEmpty').hidden = !!items.length;
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.id = `quick-${index}`;
      row.setAttribute('role', 'option');
      row.className = 'quick-result';
      row.title = item.path;
      const name = document.createElement('span');
      name.className = 'quick-name';
      name.textContent = item.name;
      const path = document.createElement('span');
      path.className = 'quick-path';
      path.textContent = item.path;
      row.append(name, path);
      row.addEventListener('click', () => accept(index));
      list.append(row);
    });
    select(0);
  }
  function close() {
    dialog.close();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function accept(index) {
    const item = items[index];
    if (!item) return;
    close();
    choose(item.path);
  }
  function open() {
    if (!getFiles().size) return;
    if (!dialog.open) {
      previousFocus = document.activeElement;
      dialog.showModal();
    }
    input.value = '';
    render();
    input.focus();
  }
  input.addEventListener('input', render);
  dialog.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') event.preventDefault();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      select(current + (event.key === 'ArrowDown' ? 1 : -1));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      accept(current);
    }
    event.stopPropagation();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  $('quickClose').addEventListener('click', close);
  $('btnQuickOpen').addEventListener('click', open);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p' && getFiles().size) {
      event.preventDefault();
      open();
    }
  });
  return { close };
}
