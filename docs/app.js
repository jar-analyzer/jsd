import { setupWelcome } from './welcome.js';
import { setupFind } from './editor-find.js';
import { setupQuickOpen } from './quick-open.js';
import { showExplorer } from './layout.js';
import { t, applyStatic, setLang } from './i18n.js';
import { Workspace } from './workspace.js';
import { WorkerClient } from './worker-client.js';
import { buildTree as drawTree, expandTree, revealTreePath, revealArchive } from './tree.js';
import { renderSource, flash, errorText, loadHighlighter } from './view.js';

const workspace = new Workspace();
const engine = new WorkerClient();
const finder = setupFind(() => workspace.current?.source ?? '');
setupQuickOpen(
  () => workspace.files,
  (path) => {
    $('search').value = '';
    if (workspace.archives.has(path)) revealArchive(path);
    buildTree(workspace.files, workspace.selected);
    revealTreePath(path);
    selectClass(path);
  },
);
const $ = (id) => document.getElementById(id);
let task = 0;
let loadingKey = null;

function buildTree(files, selected, filter = '') {
  drawTree(files, selected, filter, workspace.archives);
}

function busy(key) {
  loadingKey = key;
  $('loading').classList.toggle('show', !!key);
  $('loadingText').textContent = key ? t(key) : '';
  $('viewer').setAttribute('aria-busy', String(!!key));
}

function refresh() {
  $('sidebar').classList.toggle('has-files', !!workspace.files.size);
  $('breadcrumbs').textContent = workspace.selected?.split('/').join(' › ') ?? t('pickClass');
  $('btnSearch').disabled = $('btnQuickOpen').disabled = !workspace.files.size;
  $('toolbar').hidden = !workspace.files.size;
  $('btnClear').disabled = !workspace.files.size;
  const count = [...workspace.files.keys()].filter((path) => /\.class$/i.test(path)).length;
  $('statFiles').textContent = workspace.files.size
    ? t(count === 1 ? 'classOne' : 'classMany', { n: count })
    : t('statNone');
  $('statCache').textContent = workspace.cache.size ? t('cached', { n: workspace.cache.size }) : '';
  buildTree(workspace.files, workspace.selected, $('search').value.trim().toLowerCase());
  renderSource(workspace.current);
  finder.refresh();
  busy(loadingKey);
}

function cancel() {
  task++;
  workspace.cancel();
  engine.cancel();
  busy(null);
}

async function selectClass(path) {
  const archive = /\.(jar|war|zip)$/i.test(path);
  if (archive && workspace.archives.has(path)) return;
  if (workspace.currentPath === path && !loadingKey) return;
  const token = ++task;
  engine.cancel();
  flash('');
  busy('loading');
  try {
    if (archive) {
      busy('readingFiles');
      const expanded = await workspace.expandArchive(path, (inputs) =>
        engine.run('load', { inputs }),
      );
      if (token !== task || !expanded) return;
      revealArchive(path);
      refresh();
      return;
    }
    const pending = workspace.select(path, (files) => engine.run('decompile', { files }));
    buildTree(workspace.files, workspace.selected, $('search').value.trim().toLowerCase());
    const result = await pending;
    if (token !== task || !result) return;
    refresh();
    $('codeWrap').scrollTop = 0;
    $('codeWrap').scrollLeft = 0;
  } catch (error) {
    if (token === task && error.name !== 'AbortError') flash(errorText(error), true);
  } finally {
    if (token === task) {
      busy(null);
      buildTree(workspace.files, workspace.selected, $('search').value.trim().toLowerCase());
    }
  }
}

async function loadFiles(read) {
  const token = ++task;
  workspace.cancel();
  engine.cancel();
  flash('');
  busy('readingFiles');
  try {
    const inputs = await read();
    if (token !== task) return;
    const entries = await engine.run('load', { inputs });
    if (token !== task) return;
    workspace.replace(entries);
    $('search').value = '';
    refresh();
    const classes = entries.filter(([path]) => /\.class$/i.test(path));
    const first =
      classes.find(([path]) => !path.includes('$') && !path.endsWith('module-info.class')) ??
      classes[0];
    if (first) {
      revealTreePath(first[0]);
      await selectClass(first[0]);
    }
  } catch (error) {
    if (token === task && error.name !== 'AbortError') flash(errorText(error), true);
  } finally {
    if (token === task) busy(null);
  }
}

function addFiles(list) {
  const files = [...list];
  if (!files.length) return;
  return loadFiles(async () => {
    return Promise.all(
      files.map(async (file) => ({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })),
    );
  });
}

$('fileInput').addEventListener('change', (event) => {
  const files = [...event.target.files];
  event.target.value = '';
  addFiles(files);
});
for (const id of ['btnOpen', 'drop']) $(id).addEventListener('click', () => $('fileInput').click());
$('btnCancel').addEventListener('click', () => {
  cancel();
  refresh();
});
$('btnClear').addEventListener('click', () => {
  cancel();
  workspace.replace([]);
  $('search').value = '';
  flash('');
  refresh();
});
$('dismissNotice').addEventListener('click', () => flash(''));
$('tree').addEventListener('click', (event) => {
  const row = event.target.closest('[data-path]');
  if (row?.dataset.path) selectClass(row.dataset.path);
});
$('search').addEventListener('input', () =>
  buildTree(workspace.files, workspace.selected, $('search').value.trim().toLowerCase()),
);
$('search').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    $('search').value = '';
    buildTree(workspace.files, workspace.selected);
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    $('tree').querySelector('.row')?.focus();
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    $('tree').querySelector('.leaf > .row')?.click();
  }
});
for (const [id, open] of [
  ['btnExpand', true],
  ['btnCollapse', false],
]) {
  $(id).addEventListener('click', () => expandTree(open));
}
$('btnCopy').addEventListener('click', async () => {
  const source = workspace.current?.source;
  if (!source) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(source);
    else {
      const textarea = document.createElement('textarea');
      textarea.value = source;
      document.body.append(textarea);
      textarea.select();
      try {
        if (!document.execCommand('copy')) throw new Error('copy');
      } finally {
        textarea.remove();
      }
    }
    flash(t('copied'));
  } catch {
    flash(t('copyFailed'), true);
  }
});
$('btnDownload').addEventListener('click', () => {
  const result = workspace.current;
  if (!result?.source) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([result.source], { type: 'text/x-java-source;charset=utf-8' }),
  );
  link.download = result.name.split('/').pop() + '.java';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
for (const eventName of ['dragenter', 'dragover'])
  document.addEventListener(eventName, (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    $('drop').classList.add('over');
  });
document.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) $('drop').classList.remove('over');
});
document.addEventListener('drop', (event) => {
  event.preventDefault();
  $('drop').classList.remove('over');
  if (event.dataTransfer?.files.length) addFiles(event.dataTransfer.files);
});
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    showExplorer(document.body.classList.contains('sidebar-hidden'));
  }
  if (event.key === 'Escape') {
    cancel();
    refresh();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    $('fileInput').click();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (workspace.files.size) {
      showExplorer(true);
      $('search').focus();
    }
  }
});
document.querySelectorAll('#langSwitch button').forEach((button) =>
  button.addEventListener('click', () => {
    setLang(button.dataset.lang);
    refresh();
  }),
);
setupWelcome();
applyStatic();
refresh();
loadHighlighter(() => {
  renderSource(workspace.current);
  finder.refresh();
});
