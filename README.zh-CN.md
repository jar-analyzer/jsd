# jsd

[![Quality](https://github.com/jar-analyzer/jsd/actions/workflows/test-quality.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-quality.yml)
[![Unit](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml)
[![Round-trip](https://github.com/jar-analyzer/jsd/actions/workflows/test-roundtrip.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-roundtrip.yml)
[![Modern Java](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml)
[![Bytecode](https://github.com/jar-analyzer/jsd/actions/workflows/test-bytecode.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-bytecode.yml)
[![Package](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml)
[![Fuzz](https://github.com/jar-analyzer/jsd/actions/workflows/test-fuzz.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-fuzz.yml)

[English](./README.md) | **[简体中文](./README.zh-CN.md)**

TypeScript 实现的 Java `.class` 反编译库，支持 Node.js 和浏览器。

**单个 ESM 文件约 277 KB，gzip 后约 85 KB。** 无运行时依赖，无需 WebAssembly 或 Java 环境。

支持常见控制流、lambda、嵌套类、record 及 Java 25 的部分语法。将作为下一代 **jar-analyzer** 的反编译引擎。

[在线体验](https://jar-analyzer.github.io/jsd/)

## 使用

npm 包：[`@jar-analyzer/jsd`](https://www.npmjs.com/package/@jar-analyzer/jsd)，已发布版本 **1.1.0**。

### 1. 浏览器

通过 CDN 加载并反编译所选 `.class` 文件。

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

保存为 `example.mjs`，运行 `node example.mjs`：

```js
import { readFileSync } from 'node:fs';
import { decompileClassFile } from '@jar-analyzer/jsd';

const result = decompileClassFile(readFileSync('Example.class'));
console.log(result.source);
```

## 测试

| 测试              | 用例数 | CI 环境             |
| ----------------- | -----: | ------------------- |
| 格式              |      — | Node.js 24          |
| 类型              |      — | Node.js 24          |
| 产物与体积        |      — | Node.js 24          |
| 浏览器布局        |      4 | Chrome/Chromium     |
| 单元测试          |    323 | Node.js 24          |
| Java 往返：带调试 |    172 | JDK 8/11/17/21/25   |
| Java 往返：无调试 |    172 | JDK 8/17/25         |
| Java 9–25：带调试 |    ≤18 | JDK 21/25           |
| Java 9–25：无调试 |    ≤18 | JDK 21/25           |
| 动态字节码        |    ≤37 | JDK 11/17/21/25     |
| 值语义            |      9 | JDK 11/17/21/25     |
| 畸形 class        |     17 | JDK 11/17/21/25     |
| 安装包            |      — | Node.js 20/24       |
| 模糊测试          |  2,000 | Node.js 24 + JDK 25 |

旧版用例同时验证反编译源码按原目标版本及当前 JDK 目标版本重编译后的行为。

JDK 8 验证 Java 6/7 目标；较新 JDK 必要时使用其支持的最低目标版本。

## 许可证

[MIT](./LICENSE)
