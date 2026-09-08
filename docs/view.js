import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
let highlighter;
let renderedResult;
let renderedSource;
let renderedHighlighter;
export const escapeHtml = (text) =>
  text.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char],
  );

export function loadHighlighter(refresh) {
  import('https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/+esm')
    .then((module) => {
      highlighter = module.default;
      document.querySelectorAll('[data-example-language]').forEach((code) => {
        try {
          code.innerHTML = highlighter.highlight(code.textContent, {
            language: code.dataset.exampleLanguage,
            ignoreIllegals: true,
          }).value;
        } catch {}
      });
      refresh();
    })
    .catch(() => {});
}

export function renderSource(result) {
  const source = result?.source ?? '';
  $('welcome').hidden = !!result;
  $('codeWrap').hidden = !source;
  $('noSource').hidden = !result || !!source;
  $('btnCopy').disabled = !source;
  $('btnDownload').disabled = !source;
  if (!result) $('barText').textContent = t('pickClass');
  else {
    const state =
      result.status === 'success' ? 'ok' : result.status === 'failed' ? 'failed' : 'degraded';
    $('barText').innerHTML =
      `<span class="name">${escapeHtml(result.name)}.java</span> <span class="status-${state === 'ok' ? 'ok' : 'fail'}">${t(state)}</span>`;
  }
  $('sourceStats').textContent =
    result && source
      ? t('statLine', {
          lines: source.split('\n').length,
          classes: result.classes,
          ms: result.ms.toFixed(0),
        })
      : '';
  const diagnostics = result?.diagnostics ?? [];
  $('diagnostics').hidden = diagnostics.length === 0;
  if (renderedResult !== result) $('diagnostics').open = result?.status === 'failed';
  renderedResult = result;
  $('diagnosticSummary').textContent = t('diagnosticCount', { n: diagnostics.length });
  $('diagnosticList').replaceChildren();
  for (const diagnostic of diagnostics) {
    const item = document.createElement('li');
    const location = [
      diagnostic.stage,
      diagnostic.className ?? diagnostic.inputName,
      diagnostic.methodName,
      diagnostic.descriptor,
    ]
      .filter(Boolean)
      .join(' · ');
    item.textContent = `${location ? location + ': ' : ''}${diagnostic.message}`;
    $('diagnosticList').append(item);
  }
  if (renderedSource === source && renderedHighlighter === highlighter) return;
  renderedSource = source;
  renderedHighlighter = highlighter;
  const top = $('codeWrap').scrollTop;
  const left = $('codeWrap').scrollLeft;
  const numbers = document.createElement('div');
  numbers.className = 'ln';
  numbers.setAttribute('aria-hidden', 'true');
  numbers.textContent = source
    ? source
        .split('\n')
        .map((_, index) => index + 1)
        .join('\n')
    : '';
  const code = document.createElement('div');
  code.className = 'src';
  code.textContent = source;
  if (highlighter && source.length < 250000) {
    try {
      code.innerHTML = highlighter.highlight(source, {
        language: 'java',
        ignoreIllegals: true,
      }).value;
    } catch {
      code.textContent = source;
    }
  }
  $('code').replaceChildren(numbers, code);
  $('codeWrap').scrollTop = top;
  $('codeWrap').scrollLeft = left;
}

export function flash(message, error = false) {
  $('notice').hidden = !message;
  $('noticeText').textContent = message;
  $('notice').classList.toggle('error', error);
}

export function errorText(error) {
  const messages = {
    NO_CLASSES: 'noClasses',
    TIMEOUT: 'timeout',
    ARCHIVE_UNAVAILABLE: 'archiveUnavailable',
    WORKER_FAILED: 'workerFailed',
  };
  const message = error.message ?? String(error);
  if (message.startsWith('DUPLICATE:')) return t('duplicate') + message.slice(10);
  return messages[message] ? t(messages[message]) : t('readFail') + message;
}
