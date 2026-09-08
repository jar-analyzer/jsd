const sidebar = document.getElementById('sidebar');
const handle = document.getElementById('resizeSidebar');
const explorer = document.getElementById('btnExplorer');
const mobile = matchMedia('(max-width: 700px)');
let dragging = false;

export function showExplorer(show) {
  document.body.classList.toggle('sidebar-hidden', !show);
  explorer.setAttribute('aria-expanded', String(show));
}

function setWidth(width) {
  const max = Math.min(600, Math.floor(innerWidth * 0.6));
  const value = Math.max(180, Math.min(max, width));
  document.documentElement.style.setProperty('--sidebar-width', `${value}px`);
  handle.setAttribute('aria-valuenow', String(value));
  handle.setAttribute('aria-valuemax', String(max));
}

explorer.addEventListener('click', () =>
  showExplorer(document.body.classList.contains('sidebar-hidden')),
);
document.getElementById('btnSearch').addEventListener('click', () => {
  showExplorer(true);
  document.getElementById('search').focus();
});
handle.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = true;
  handle.setPointerCapture(event.pointerId);
  document.body.classList.add('resizing');
  event.preventDefault();
});
handle.addEventListener('pointermove', (event) => {
  if (dragging) setWidth(event.clientX - sidebar.getBoundingClientRect().left);
});
function finishResize() {
  dragging = false;
  document.body.classList.remove('resizing');
}
handle.addEventListener('pointerup', finishResize);
handle.addEventListener('lostpointercapture', finishResize);
handle.addEventListener('pointercancel', finishResize);
handle.addEventListener('keydown', (event) => {
  const width = sidebar.getBoundingClientRect().width;
  const next = { ArrowLeft: width - 20, ArrowRight: width + 20, Home: 180, End: 600 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  setWidth(next);
});
window.addEventListener('resize', () =>
  setWidth(parseFloat(getComputedStyle(sidebar).width) || 280),
);
mobile.addEventListener('change', () => showExplorer(!mobile.matches));
showExplorer(!mobile.matches);
setWidth(280);
