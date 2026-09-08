import { t } from './i18n.js';

export function setupWelcome() {
  document.getElementById('welcomeOpen').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  const tabs = [...document.querySelectorAll('.usage-tabs [role="tab"]')];
  function activate(tab) {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    }
    document.getElementById('exampleCopyStatus').textContent = '';
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      const next = {
        ArrowRight: tabs[(index + 1) % tabs.length],
        ArrowLeft: tabs[(index + tabs.length - 1) % tabs.length],
        Home: tabs[0],
        End: tabs.at(-1),
      }[event.key];
      if (!next) return;
      event.preventDefault();
      activate(next);
      next.focus();
    });
  }
  for (const button of document.querySelectorAll('[data-copy-example]')) {
    button.addEventListener('click', async () => {
      const status = document.getElementById('exampleCopyStatus');
      try {
        await navigator.clipboard.writeText(
          document.getElementById(button.dataset.copyExample).textContent,
        );
        status.textContent = t('copied');
      } catch {
        status.textContent = t('exampleCopyFailed');
      }
    });
  }
}
