import { t } from './i18n.js';
import { findMatches } from './search-model.js';
import { clearMatches, highlightMatches } from './find-highlight.js';

export function setupFind(getSource) {
  const $ = (id) => document.getElementById(id);
  const panel = $('findBar');
  const input = $('findInput');
  let current = -1;
  let result = { matches: [], limited: false };
  let timer;
  function select(index, scroll = false) {
    const count = result.matches.length;
    current = count ? (index + count) % count : -1;
    for (const mark of $('code').querySelectorAll('.find-match'))
      mark.classList.toggle('active', Number(mark.dataset.hit) === current);
    $('findCount').textContent = !input.value
      ? ''
      : count
        ? `${current + 1} / ${count}${result.limited ? '+' : ''}`
        : t('noMatch');
    input.setAttribute('aria-invalid', String(!!input.value && !count));
    $('findPrev').disabled = $('findNext').disabled = !count;
    if (scroll)
      $('code')
        .querySelector(`mark[data-hit="${current}"]`)
        ?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  function refresh(scroll = false) {
    $('btnFind').disabled = !getSource();
    if (panel.hidden) return;
    if (!getSource()) {
      close(false);
      return;
    }
    result = findMatches(getSource(), input.value, {
      matchCase: $('findCase').getAttribute('aria-pressed') === 'true',
      wholeWord: $('findWord').getAttribute('aria-pressed') === 'true',
    });
    const root = $('code').querySelector('.src');
    if (root) highlightMatches(root, result.matches);
    select(Math.max(0, Math.min(current, result.matches.length - 1)), scroll);
  }
  function open() {
    if (!getSource()) return;
    panel.hidden = false;
    const selection = getSelection();
    if ($('code').contains(selection?.anchorNode) && selection.toString().length < 200)
      input.value = selection.toString() || input.value;
    refresh();
    input.focus();
    input.select();
  }
  function close(focus = true) {
    clearTimeout(timer);
    panel.hidden = true;
    const root = $('code').querySelector('.src');
    if (root) clearMatches(root);
    if (focus) $('codeWrap').focus({ preventScroll: true });
  }
  $('btnFind').addEventListener('click', open);
  $('findClose').addEventListener('click', () => close());
  input.addEventListener('input', () => {
    clearTimeout(timer);
    current = 0;
    timer = setTimeout(() => refresh(true), 80);
  });
  for (const id of ['findCase', 'findWord'])
    $(id).addEventListener('click', () => {
      $(id).setAttribute('aria-pressed', String($(id).getAttribute('aria-pressed') !== 'true'));
      refresh(true);
    });
  $('findPrev').addEventListener('click', () => select(current - 1, true));
  $('findNext').addEventListener('click', () => select(current + 1, true));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(timer);
      refresh();
      select(current + (event.shiftKey ? -1 : 1), true);
    }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && getSource()) {
      event.preventDefault();
      open();
    }
    if (event.key === 'F3' && !panel.hidden) {
      event.preventDefault();
      select(current + (event.shiftKey ? -1 : 1), true);
    }
  });
  return { refresh, close };
}
