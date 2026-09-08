# jsd

[![Quality](https://github.com/jar-analyzer/jsd/actions/workflows/test-quality.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-quality.yml)
[![Unit](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml)
[![Round-trip](https://github.com/jar-analyzer/jsd/actions/workflows/test-roundtrip.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-roundtrip.yml)
[![Modern Java](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml)
[![Bytecode](https://github.com/jar-analyzer/jsd/actions/workflows/test-bytecode.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-bytecode.yml)
[![Package](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml)
[![Fuzz](https://github.com/jar-analyzer/jsd/actions/workflows/test-fuzz.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-fuzz.yml)

**[English](./README.md)** | [简体中文](./README.zh-CN.md)

A Java `.class` decompiler written in TypeScript. Runs in Node.js and browsers as a single ESM bundle, with no runtime dependencies or WebAssembly.

**Small enough to drop straight into your page: just one ~238 KB JavaScript file (~72 KB with gzip) to decompile Java `.class` files.** No runtime dependencies, WebAssembly or Java installation required.

Size measured from the current minified `dist/jsd.min.js` bundle (~238 KB (0.238 MB) before gzip; ~72 KB (0.072 MB) after gzip).

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

Input size is unlimited by default. To limit each `.class` file to 10 MB:

```js
const result = decompileClassFile(data, { maxInputBytes: 10 * 1000 * 1000 });
```

Oversized files raise an error. Batch processing records the error and continues with other files.

For batches, use `maxTotalInputBytes` to limit the total loaded size and `maxClasses` to limit the number of loaded classes. `maxOutputChars` limits generated source; `maxWork` and `timeoutMs` limit processing. All limits are optional.

## Testing

`npm test` runs the build, unit, core round-trip and bytecode suites (JDK 11+). `npm run test:all` also runs quality checks, both Java debug modes, modern Java, package and fuzz tests (JDK 25+). Each run builds the library at most once.

| Suite            | Command                                  | Coverage                                                                                                               | CI environment                               |
| ---------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Quality          | `npm run format:check` / `npm run check` | Formatting, TypeScript checks and browser bundle consistency in CI                                                     | Node.js 24                                   |
| Unit             | `npm run test:unit`                      | 216 engine and demo cases: parsing, types, diagnostics, resource limits and UI state                                   | Node.js 24                                   |
| Java round-trip  | `npm run test:roundtrip`                 | 138 cases covering evaluation order, control flow, exceptions and resources; `-- --no-debug` removes debug information | JDK 8, 11, 17, 21, 25; no-debug on 8, 17, 25 |
| Modern Java      | `npm run test:modern`                    | Up to 14 Java 9–25 cases, with and without debug information                                                           | JDK 21, 25                                   |
| Bytecode         | `npm run test:bytecode`                  | Up to 37 dynamic bytecode cases and 17 malformed-class JVM checks                                                      | JDK 11, 17, 21, 25                           |
| Package consumer | `npm run test:package`                   | Local package installation, TypeScript declarations, ESM imports, public APIs and license                              | Node.js 20, 24                               |
| Fuzz             | `npm run test:fuzz`                      | 2,000 deterministic mutations per run, with an isolated corpus and worker                                              | Node.js 24, JDK 25                           |

Counts reflect the current suite; applicable Java cases depend on the JDK version. Each CI category has its own workflow, triggered independently on pushes and pull requests. Workflows can run concurrently, subject to available runners.

## License

[MIT](./LICENSE)
