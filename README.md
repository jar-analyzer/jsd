# jsd

[![Round-trip](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml)
[![No debug info](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml)
[![Modern Java](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml)
[![Unit tests](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml)
[![Package consumer](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml)
[![Fuzz](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml)

**[English](./README.md)** | [简体中文](./README.zh-CN.md)

A Java `.class` decompiler written in TypeScript. Runs in Node.js and browsers as a single ESM bundle, with no runtime dependencies or WebAssembly.

**Small enough to drop straight into your page: just one ~208 KB JavaScript file (~63 KB with gzip) to decompile Java `.class` files.** No runtime dependencies, WebAssembly or Java installation required.

Size measured from the current minified `dist/jsd.min.js` bundle (~208 KB (0.208 MB) before gzip; ~63 KB (0.063 MB) after gzip).

[Try the live demo](https://jar-analyzer.github.io/jsd/)

It will serve as the underlying decompilation engine for the next generation of **jar-analyzer**.

Supports common control flow, lambdas, nested classes, records and selected syntax through Java 25.

## Usage

Published on npm as [`@jar-analyzer/jsd`](https://www.npmjs.com/package/@jar-analyzer/jsd), currently at version **1.0.3**.

### 1. Browser

Load from the CDN and choose a `.class` file to view its source.

```html
<input type="file" accept=".class" />
<pre id="source"></pre>
<script type="module">
  import { decompileClassFile } from 'https://cdn.jsdelivr.net/npm/@jar-analyzer/jsd@1.0.3/dist/jsd.min.js';

  document.querySelector('input').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    document.getElementById('source').textContent = decompileClassFile(bytes).source;
  };
</script>
```

### 2. Node.js

```sh
npm i @jar-analyzer/jsd
```

Save as `example.mjs` and run `node example.mjs`:

```js
import { readFileSync } from 'node:fs';
import { decompileClassFile } from '@jar-analyzer/jsd';

const result = decompileClassFile(readFileSync('Example.class'));
console.log(result.source);
```

## Testing

| CI suite         | Coverage                                                                                                                               | Environment           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Unit             | Bytecode parsing, control flow, Java literals, diagnostics, Demo state and archive handling; formatting and browser bundle consistency | Node.js 24            |
| Round-trip       | Compile and run original and recovered Java; compare output and fixture expectations                                                   | JDK 8, 11, 17, 21, 25 |
| No debug info    | Round-trip cases compiled without debug information                                                                                    | JDK 8, 17, 25         |
| Modern Java      | Selected Java 9–25 syntax, with and without debug information                                                                          | JDK 21, 25            |
| Package consumer | Install the packed package; check TypeScript declarations, ESM imports, public APIs and license inclusion                              | Node.js 20, 24        |
| Fuzz             | 2,000 bytecode mutations with a fixed seed; monitor crashes and timeouts                                                               | Node.js 24, JDK 25    |

## License

[MIT](./LICENSE)
