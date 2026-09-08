export function enableTreeKeyboard(tree) {
  tree.addEventListener('keydown', (event) => {
    const row = event.target.closest('.row');
    if (!row) return;
    const rows = [...tree.querySelectorAll('.row')].filter((item) => item.getClientRects().length);
    const index = rows.indexOf(row);
    let next;
    switch (event.key) {
      case 'ArrowDown':
        next = rows[Math.min(index + 1, rows.length - 1)];
        break;
      case 'ArrowUp':
        next = rows[Math.max(index - 1, 0)];
        break;
      case 'Home':
        next = rows[0];
        break;
      case 'End':
        next = rows.at(-1);
        break;
      case 'ArrowRight':
        if (!row.dataset.dir && /\.(jar|war|zip)$/i.test(row.dataset.path ?? '')) {
          row.click();
          break;
        }
        if (!row.dataset.dir) return;
        if (row.getAttribute('aria-expanded') === 'false') row.click();
        else next = row.parentElement.querySelector(':scope > .children .row');
        break;
      case 'ArrowLeft':
        if (row.dataset.dir && row.getAttribute('aria-expanded') === 'true') row.click();
        else next = row.parentElement.parentElement.closest('.node.dir')?.querySelector('.row');
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next) {
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });
}
