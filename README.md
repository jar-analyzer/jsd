# jsd

[![Quality](https://github.com/jar-analyzer/jsd/actions/workflows/test-quality.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-quality.yml)
[![Unit](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml)
[![Round-trip](https://github.com/jar-analyzer/jsd/actions/workflows/test-roundtrip.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-roundtrip.yml)
[![Modern Java](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml)
[![Bytecode](https://github.com/jar-analyzer/jsd/actions/workflows/test-bytecode.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-bytecode.yml)
[![Package](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml)
[![Fuzz](https://github.com/jar-analyzer/jsd/actions/workflows/test-fuzz.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-fuzz.yml)

**[English](./README.md)** | [简体中文](./README.zh-CN.md)

A TypeScript Java `.class` decompiler for Node.js and browsers.

**Single ESM bundle: approximately 277 KB, or 85 KB with gzip.** No runtime dependencies, WebAssembly or Java installation required.

Supports common control flow, lambdas, nested classes, records and selected Java features through Java 25. Intended as the decompilation engine for the next generation of **jar-analyzer**.

[Live demo](https://jar-analyzer.github.io/jsd/)

## Usage

npm package: [`@jar-analyzer/jsd`](https://www.npmjs.com/package/@jar-analyzer/jsd), published version **1.1.0**.

### 1. Browser

Load from the CDN and decompile a selected `.class` file.

```html
<input type="file" accept=".class" />
<pre id="source"></pre>
<script type="module">
  import { decompileClassFile } from 'https://cdn.jsdelivr.net/npm/@jar-analyzer/jsd@1.1.0/dist/jsd.min.js';

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
npm install @jar-analyzer/jsd
```

Save as `example.mjs` and run `node example.mjs`:

```js
import { readFileSync } from 'node:fs';
import { decompileClassFile } from '@jar-analyzer/jsd';

const result = decompileClassFile(readFileSync('Example.class'));
console.log(result.source);
```

## Testing

| Test                 | Cases | CI runtime          |
| -------------------- | ----: | ------------------- |
| Formatting           |     — | Node.js 24          |
| Types                |     — | Node.js 24          |
| Bundle & sizes       |     — | Node.js 24          |
| Browser layout       |     4 | Chrome/Chromium     |
| Unit                 |   323 | Node.js 24          |
| Round-trip: debug    |   172 | JDK 8/11/17/21/25   |
| Round-trip: no debug |   172 | JDK 8/17/25         |
| Java 9–25: debug     |   ≤18 | JDK 21/25           |
| Java 9–25: no debug  |   ≤18 | JDK 21/25           |
| Dynamic bytecode     |   ≤37 | JDK 11/17/21/25     |
| Value semantics      |     9 | JDK 11/17/21/25     |
| Malformed classes    |    17 | JDK 11/17/21/25     |
| Package              |     — | Node.js 20/24       |
| Fuzz                 | 2,000 | Node.js 24 + JDK 25 |

Legacy fixtures verify recovered sources against both the original target and the current JDK target.

JDK 8 validates Java 6/7 targets; newer JDKs use their oldest supported target when necessary.

## License

[MIT](./LICENSE)
