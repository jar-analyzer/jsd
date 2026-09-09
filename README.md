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

**Single ESM bundle: approximately 239 KB, or 72 KB with gzip.** No runtime dependencies, WebAssembly or Java installation required.

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

### 3. Input limits

Input size is unlimited by default. Limit each `.class` file to 10 MB:

```js
const result = decompileClassFile(data, { maxInputBytes: 10 * 1000 * 1000 });
```

Oversized files raise an error. Batch processing records the error and continues with other files.

Other optional limits: `maxTotalInputBytes` (batch size), `maxClasses` (class count), `maxOutputChars` (output characters), `maxWork` (work units) and `timeoutMs` (processing time).

## Testing

| Suite           | Coverage                                                            | CI environment                             |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| Quality         | Formatting and types; CI also checks browser bundle consistency     | Node.js 24                                 |
| Unit            | 216 engine and demo cases                                           | Node.js 24                                 |
| Java round-trip | 138 cases: evaluation order, control flow, exceptions and resources | JDK 8, 11, 17, 21, 25; no-debug: 8, 17, 25 |
| Modern Java     | Up to 14 Java 9–25 cases, with and without debug information        | JDK 21, 25                                 |
| Bytecode        | Up to 37 dynamic bytecode cases and 17 malformed-class JVM checks   | JDK 11, 17, 21, 25                         |
| Package         | Installation, type declarations, ESM, public APIs and license       | Node.js 20, 24                             |
| Fuzz            | 2,000 fixed-seed bytecode mutations                                 | Node.js 24, JDK 25                         |

## License

[MIT](./LICENSE)
