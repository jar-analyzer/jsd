# jsd

[![Round-trip](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml)
[![No debug info](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml)
[![Modern Java](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml)
[![Unit tests](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml)
[![Package consumer](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml)
[![Fuzz](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml)

**[English](./README.md)** | [简体中文](./README.zh-CN.md)

A Java `.class` decompiler written in TypeScript. Runs in Node.js and browsers as a single ESM bundle, with no runtime dependencies or WebAssembly.

It will serve as the underlying decompilation engine for the next generation of **jar-analyzer**.

Supports common control flow, lambdas, nested classes, records and selected syntax through Java 25.

## Usage

### 1. Browser

Save this page in the repository root and serve it over HTTP. Choose a `.class` file to view its source.

```html
<input type="file" accept=".class" />
<pre id="source"></pre>
<script type="module">
  import { decompileClassFile } from './dist/jsd.min.js';

  document.querySelector('input').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    document.getElementById('source').textContent = decompileClassFile(bytes).source;
  };
</script>
```

### 2. Node.js

Save as `example.mjs` in the repository root and run `node example.mjs`:

```js
import { readFileSync } from 'node:fs';
import { decompileClassFile } from './dist/jsd.min.js';

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
