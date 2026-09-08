import { t } from './i18n.js';

export function setupEditorTabs(workspace, select, close) {
  const bar = document.getElementById('editorTabs');
  const menu = document.getElementById('tabContextMenu');
  let menuPath = null;
  let lastActive = null;
  function tabFor(path) {
    return [...bar.querySelectorAll('[role="tab"]')].find((tab) => tab.dataset.path === path);
  }
  function hideMenu(focus = false) {
    menu.hidden = true;
    if (focus) tabFor(menuPath)?.focus({ preventScroll: true });
    menuPath = null;
  }
  function showMenu(path, x, y) {
    menuPath = path;
    const index = workspace.tabs.indexOf(path);
    for (const button of menu.querySelectorAll('button')) {
      const mode = button.dataset.closeTabs;
      button.disabled =
        (mode === 'left' && index === 0) ||
        (mode === 'right' && index === workspace.tabs.length - 1) ||
        (mode === 'others' && workspace.tabs.length === 1);
    }
    menu.hidden = false;
    menu.style.left = `${Math.max(4, Math.min(x, innerWidth - menu.offsetWidth - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, innerHeight - menu.offsetHeight - 4))}px`;
    menu.querySelector('button:not(:disabled)').focus();
  }
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-close-tabs]');
    if (!button || button.disabled) return;
    const path = menuPath;
    hideMenu();
    close(path, button.dataset.closeTabs);
    tabFor(workspace.currentPath)?.focus({ preventScroll: true });
  });
  menu.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      hideMenu(true);
    }
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = {
      ArrowDown: buttons[(index + 1) % buttons.length],
      ArrowUp: buttons[(index + buttons.length - 1) % buttons.length],
      Home: buttons[0],
      End: buttons.at(-1),
    }[event.key];
    if (next) {
      event.preventDefault();
      next.focus();
    }
    if (event.key === 'Tab') hideMenu();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !menu.contains(event.target)) hideMenu();
  });
  window.addEventListener('resize', () => hideMenu());
  bar.addEventListener('scroll', () => hideMenu());
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'w' &&
      workspace.tabs.length
    ) {
      event.preventDefault();
      close(workspace.currentPath, event.shiftKey ? 'all' : 'current');
    }
  });
  function refresh() {
    const focusPath = bar.contains(document.activeElement)
      ? document.activeElement.closest('[data-path]')?.dataset.path
      : null;
    bar.hidden = !workspace.tabs.length;
    const oldScroll = bar.scrollLeft;
    bar.replaceChildren();
    for (const path of workspace.tabs) {
      const item = document.createElement('div');
      item.className = 'editor-tab';
      item.classList.toggle('active', path === workspace.currentPath);
      item.dataset.path = path;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(path === workspace.currentPath));
      tab.setAttribute('aria-controls', 'codeWrap');
      tab.tabIndex = path === workspace.currentPath ? 0 : -1;
      tab.dataset.path = path;
      tab.title = path;
      tab.setAttribute('aria-label', path);
      const icon = document.createElement('span');
      icon.className = 'tab-class-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'J';
      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = path.split('/').pop();
      tab.append(icon, label);
      tab.addEventListener('click', () => select(path));
      tab.addEventListener('keydown', (event) => {
        const index = workspace.tabs.indexOf(path);
        const next = {
          ArrowRight: workspace.tabs[(index + 1) % workspace.tabs.length],
          ArrowLeft: workspace.tabs[(index + workspace.tabs.length - 1) % workspace.tabs.length],
          Home: workspace.tabs[0],
          End: workspace.tabs.at(-1),
        }[event.key];
        if (next) {
          event.preventDefault();
          select(next);
          tabFor(next)?.focus({ preventScroll: true });
        }
        if (event.key === 'Delete') {
          event.preventDefault();
          close(path, 'current');
          tabFor(workspace.currentPath)?.focus({ preventScroll: true });
        }
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const rect = tab.getBoundingClientRect();
          showMenu(path, rect.left, rect.bottom);
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tab-close';
      remove.title = t('closeTab');
      remove.setAttribute('aria-label', `${t('closeTab')}: ${path}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        close(path, 'current');
        tabFor(workspace.currentPath)?.focus({ preventScroll: true });
      });
      item.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showMenu(path, event.clientX, event.clientY);
      });
      item.addEventListener('mousedown', (event) => {
        if (event.button === 1) event.preventDefault();
      });
      item.addEventListener('auxclick', (event) => {
        if (event.button === 1) {
          event.preventDefault();
          close(path, 'current');
        }
      });
      item.append(tab, remove);
      bar.append(item);
    }
    bar.scrollLeft = oldScroll;
    if (focusPath) tabFor(focusPath)?.focus({ preventScroll: true });
    if (workspace.currentPath !== lastActive) {
      tabFor(workspace.currentPath)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      lastActive = workspace.currentPath;
    }
  }
  return { refresh };
}
