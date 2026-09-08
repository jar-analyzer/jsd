import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function view() {
  const nodes = new Map<string, any>();
  const element = () => ({
    children: [] as any[],
    textContent: '',
    innerHTML: '',
    hidden: false,
    open: false,
    classList: { toggle() {} },
    setAttribute() {},
    append(...items: any[]) {
      this.children.push(...items);
    },
    replaceChildren(...items: any[]) {
      this.children = items;
    },
  });
  const document = {
    getElementById(id: string) {
      if (!nodes.has(id)) nodes.set(id, element());
      return nodes.get(id);
    },
    createElement: element,
  };
  const source = readFileSync('docs/view.js', 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '');
  const context: any = { document, t: (key: string) => key };
  runInNewContext(source + '\nglobalThis.render = renderSource;', context);
  return { nodes, render: context.render };
}

const result = (overrides = {}) => ({
  name: 'Example',
  source: 'class Example {}',
  status: 'success',
  diagnostics: [],
  classes: 1,
  ms: 1,
  ...overrides,
});

test('partial source renders explicit diagnostics as text and healthy source clears them', () => {
  const { nodes, render } = view();
  render(result({ status: 'partial', diagnostics: [{ message: '<bad input>' }] }));
  assert.equal(nodes.get('diagnostics').hidden, false);
  assert.equal(nodes.get('diagnosticList').children[0].textContent, '<bad input>');
  assert.equal(nodes.get('diagnosticList').children[0].innerHTML, '');
  assert.match(nodes.get('barText').innerHTML, /degraded/);
  render(result({ source: 'class Example { String s = "DECOMPILATION FAILED"; }' }));
  assert.equal(nodes.get('diagnostics').hidden, true);
  assert.match(nodes.get('barText').innerHTML, /status-ok/);
});

test('failed source disables export and presents parse diagnostics without placeholder Java', () => {
  const { nodes, render } = view();
  render(
    result({
      source: '',
      status: 'failed',
      classes: 0,
      diagnostics: [{ inputName: 'Broken.class', message: '<bad input>' }],
    }),
  );
  assert.equal(nodes.get('diagnostics').open, true);
  assert.equal(nodes.get('diagnosticList').children[0].textContent, 'Broken.class: <bad input>');
  assert.equal(nodes.get('btnCopy').disabled, true);
  assert.equal(nodes.get('btnDownload').disabled, true);
  assert.equal(nodes.get('noSource').hidden, false);
});

test('reset removes old source, diagnostics and export actions', () => {
  const { nodes, render } = view();
  render(result({ status: 'partial', diagnostics: [{ message: 'warning' }] }));
  render(null);
  assert.equal(nodes.get('welcome').hidden, false);
  assert.equal(nodes.get('codeWrap').hidden, true);
  assert.equal(nodes.get('code').children[1].textContent, '');
  assert.equal(nodes.get('diagnostics').hidden, true);
  assert.equal(nodes.get('btnDownload').disabled, true);
});

test('refreshing the same source preserves code nodes, scroll and open diagnostics', () => {
  const { nodes, render } = view();
  const current = result({ status: 'partial', diagnostics: [{ message: 'warning' }] });
  render(current);
  const sourceNode = nodes.get('code').children[1];
  nodes.get('codeWrap').scrollTop = 125;
  nodes.get('diagnostics').open = true;
  render(current);
  assert.equal(nodes.get('code').children[1], sourceNode);
  assert.equal(nodes.get('codeWrap').scrollTop, 125);
  assert.equal(nodes.get('diagnostics').open, true);
});
