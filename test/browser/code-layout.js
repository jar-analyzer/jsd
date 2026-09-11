import { renderSource } from '../../docs/view.js';

const results = [];
const wrap = document.getElementById('codeWrap');
const render = (source) =>
  renderSource({
    name: 'Example',
    source,
    status: 'success',
    diagnostics: [],
    classes: 1,
    ms: 0,
  });
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const near = (actual, expected, message) =>
  check(Math.abs(actual - expected) <= 1, `${message}: ${actual} vs ${expected}`);
const textBounds = (element) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
};
const gutter = () => {
  const node = document.querySelector('#code .ln');
  const bounds = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  near(bounds.left, wrap.getBoundingClientRect().left, 'gutter left edge');
  near(
    bounds.width,
    textBounds(node).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
    'gutter intrinsic width',
  );
  return bounds;
};
const test = (name, run) => {
  try {
    run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
};

test('line numbers stay at the left when switching between short and long sources', () => {
  for (const source of ['x', 'x'.repeat(400), 'class Example {}']) {
    render(source);
    wrap.scrollLeft = 0;
    const bounds = gutter();
    near(
      document.querySelector('#code .src').getBoundingClientRect().left,
      bounds.right,
      'source follows gutter',
    );
  }
});

test('resizing the code pane does not stretch the line-number column', () => {
  render('class Example {}');
  const original = document.body.style.width;
  try {
    let width;
    for (const size of [1100, 760, 480]) {
      document.body.style.width = `${size}px`;
      wrap.scrollLeft = 0;
      const bounds = gutter();
      if (width !== undefined) near(bounds.width, width, 'gutter width after resize');
      width = bounds.width;
    }
  } finally {
    document.body.style.width = original;
  }
});

test('horizontal scrolling keeps an opaque gutter over the source', () => {
  render('x'.repeat(600));
  check(wrap.scrollWidth > wrap.clientWidth, 'fixture must overflow horizontally');
  for (const offset of [
    120,
    (wrap.scrollWidth - wrap.clientWidth) / 2,
    wrap.scrollWidth - wrap.clientWidth,
  ]) {
    wrap.scrollLeft = offset;
    check(wrap.scrollLeft > 0, 'horizontal scroll must be applied');
    const bounds = gutter();
    const hit = document.elementFromPoint(bounds.left + 4, wrap.getBoundingClientRect().top + 16);
    check(
      hit?.closest('.ln') === document.querySelector('#code .ln'),
      'source must not cover gutter',
    );
  }
  render('x');
  check(wrap.scrollLeft === 0, 'short source must clear horizontal overflow');
  gutter();
});

test('highlighted and scrolled multi-line sources remain aligned with their line numbers', () => {
  for (const count of [9, 1000]) {
    const source = Array.from({ length: count }, () => 'class Example {}').join('\n');
    render(source);
    const code = document.querySelector('#code .src');
    code.innerHTML = source.replaceAll('class', '<span class="hljs-keyword">class</span>');
    wrap.scrollTop = count > 9 ? 300 : 0;
    const numbers = document.querySelector('#code .ln');
    check(numbers.textContent.split('\n').length === count, 'line-number count');
    gutter();
    near(textBounds(numbers).top, textBounds(code).top, 'vertical text alignment');
    near(
      parseFloat(getComputedStyle(numbers).lineHeight),
      parseFloat(getComputedStyle(code).lineHeight),
      'line height',
    );
  }
});

const output = document.createElement('script');
output.id = 'layout-results';
output.type = 'application/json';
output.textContent = JSON.stringify(results);
document.body.append(output);
