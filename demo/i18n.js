const dict = {
  en: {
    quickOpen: 'Go to file…',
    quickHint: 'Search files by name or path…',
    quickKeys: '↑↓ navigate · Enter open · Esc close',
    fileMatches: '{n} matching files',
    showingFiles: 'Showing {shown} of {n} files',
    findSource: 'Find',
    findShortcut: 'Find in source (Ctrl/Cmd+F)',
    matchCase: 'Match case',
    wholeWord: 'Match whole word',
    previousMatch: 'Previous match (Shift+Enter)',
    nextMatch: 'Next match (Enter)',
    close: 'Close (Escape)',
    filesTitle: 'EXPLORER',
    resizeExplorer: 'Resize explorer',
    clear: 'Clear',
    dropTitle: 'Drop Java files here',
    localNote: 'Your files stay in this browser.',
    welcomeTitle: 'From bytecode to readable Java',
    welcomeHint:
      'Open a class or archive, then explore its source. No installation or upload required.',
    stepOpen: '01 · Open files',
    stepSelect: '02 · Select a class',
    stepExport: '03 · Copy or download',
    noSource: 'No Java source was produced. Review the diagnostics above.',
    cancel: 'Cancel',
    dismiss: 'Dismiss message',
    noClasses: 'No class files or nested archives found.',
    timeout: 'Decompilation took too long. Try another class.',
    archiveUnavailable:
      'Archive support could not load. Check your connection or open extracted .class files.',
    workerFailed:
      'The processing worker could not start or stopped unexpectedly. Serve the demo over HTTP and try again.',
    duplicate: 'Duplicate file path; open these inputs separately: ',
    copyFailed: 'Could not copy. Select the source manually or download the Java file.',

    title: 'jsd — Java class decompiler',
    tag: 'Java decompiler',
    btnDownload: 'Download .java',
    btnCopy: 'Copy source',
    btnOpen: 'Open files',
    dropHint: 'Drop <b>.jar</b> / <b>.war</b> / <b>.class</b> here',
    dropClick: 'or click to choose files',
    searchPh: 'Filter class or package…',
    expandAll: 'Expand all',
    collapseTop: 'Collapse all',
    emptyTitle: 'No file loaded',
    emptyHint: 'A jar expands into a file tree; click a .class to decompile',
    pickClass: 'Select a class file on the left',
    statNone: 'no file loaded',
    loading: 'Decompiling…',
    readingFiles: 'Reading files…',
    readFail: 'Failed to read: ',
    classOne: '1 class',
    classMany: '{n} classes',
    noMatch: 'No match',
    decompiling: 'Decompiling {name}…',
    cached: 'Cached: {n}',
    statLine: '{lines} lines · {ms} ms',
    degraded: 'partially recovered',
    failed: 'decompilation failed',
    diagnosticCount: '{n} diagnostics',
    ok: 'ok',
    copied: 'Copied',
  },
  zh: {
    quickOpen: '转到文件…',
    quickHint: '搜索文件名或路径…',
    quickKeys: '↑↓ 选择 · Enter 打开 · Esc 关闭',
    fileMatches: '{n} 个匹配文件',
    showingFiles: '显示 {shown} / {n} 个文件',
    findSource: '查找',
    findShortcut: '查找源码 (Ctrl/Cmd+F)',
    matchCase: '区分大小写',
    wholeWord: '全字匹配',
    previousMatch: '上一个匹配 (Shift+Enter)',
    nextMatch: '下一个匹配 (Enter)',
    close: '关闭 (Escape)',
    filesTitle: '文件浏览',
    resizeExplorer: '调整文件栏宽度',
    clear: '清空',
    dropTitle: '拖入 Java 文件',
    localNote: '文件仅在当前浏览器内处理。',
    welcomeTitle: '从字节码到可读的 Java',
    welcomeHint: '打开 class 或压缩包，浏览反编译源码。无需安装，无需上传。',
    stepOpen: '01 · 打开文件',
    stepSelect: '02 · 选择类',
    stepExport: '03 · 复制或下载',
    noSource: '未生成 Java 源码，请查看上方诊断信息。',
    cancel: '取消',
    dismiss: '关闭消息',
    noClasses: '未找到 class 文件或嵌套压缩包。',
    timeout: '反编译耗时过长，请尝试其他 class 文件。',
    archiveUnavailable: '无法加载压缩包支持，请检查网络或打开解压后的 .class 文件。',
    workerFailed: '处理线程未能启动或意外停止，请通过 HTTP 启动演示后重试。',
    duplicate: '发现重复文件路径，请分别打开这些文件：',
    copyFailed: '复制失败，请手动选择源码或下载 Java 文件。',

    title: 'jsd — Java class 反编译器',
    tag: 'Java 反编译器',
    btnDownload: '下载 .java',
    btnCopy: '复制源码',
    btnOpen: '打开文件',
    dropHint: '拖放 <b>.jar</b> / <b>.war</b> / <b>.class</b> 到此处',
    dropClick: '或点击选择文件',
    searchPh: '搜索类名或包路径…',
    expandAll: '展开全部',
    collapseTop: '收起全部',
    emptyTitle: '尚未加载文件',
    emptyHint: 'jar 会展开为文件树，点击 .class 即可反编译',
    pickClass: '在左侧选择一个 class 文件',
    statNone: '未加载',
    loading: '反编译中…',
    readingFiles: '读取文件…',
    readFail: '读取失败：',
    classOne: '1 个类',
    classMany: '{n} 个类',
    noMatch: '无匹配',
    decompiling: '反编译 {name}…',
    cached: '已缓存 {n} 个类',
    statLine: '{lines} 行 · {classes} 个类 · {ms} ms',
    degraded: '部分恢复',
    failed: '反编译失败',
    diagnosticCount: '{n} 条诊断信息',
    ok: '成功',
    copied: '已复制',
  },
};

export let lang = 'en';
try {
  lang = localStorage.getItem('jsd-lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
} catch {}
if (!dict[lang]) lang = 'en';

export function t(key, params) {
  let s = dict[lang][key] ?? dict.en[key] ?? key;
  if (params)
    for (const [k, v] of Object.entries(params)) s = s.replaceAll('{' + k + '}', String(v));
  return s;
}

export function applyStatic() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document
    .querySelectorAll('[data-i18n-html]')
    .forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  document
    .querySelectorAll('[data-i18n-ph]')
    .forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  document
    .querySelectorAll('[data-i18n-title]')
    .forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  document
    .querySelectorAll('[data-i18n-aria]')
    .forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  document.querySelectorAll('#langSwitch button').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === lang);
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  });
}

export function setLang(next) {
  if (!dict[next] || next === lang) return;
  lang = next;
  try {
    localStorage.setItem('jsd-lang', lang);
  } catch {}
  applyStatic();
}
