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

**单个 ESM 文件约 239 KB，gzip 后约 72 KB。** 无运行时依赖，无需 WebAssembly 或 Java 环境。

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

### 3. 输入限制

默认不限制输入大小。以下配置将单个 `.class` 文件限制为 10 MB：

```js
const result = decompileClassFile(data, { maxInputBytes: 10 * 1000 * 1000 });
```

文件超限时抛出错误；批量处理记录错误并继续处理其他文件。

其他可选限制：`maxTotalInputBytes`（批量总大小）、`maxClasses`（类数量）、`maxOutputChars`（输出字符数）、`maxWork`（工作量）、`timeoutMs`（耗时）。

## 测试

| 分类      | 覆盖内容                                              | CI 环境                                      |
| --------- | ----------------------------------------------------- | -------------------------------------------- |
| 质量检查  | 格式、类型检查；CI 另校验浏览器产物一致性             | Node.js 24                                   |
| 单元测试  | 216 个引擎与 Demo 用例                                | Node.js 24                                   |
| Java 往返 | 138 个用例，覆盖求值顺序、控制流、异常和资源管理      | JDK 8、11、17、21、25；无调试信息：8、17、25 |
| 现代 Java | 最多 14 个 Java 9–25 用例，覆盖有、无调试信息两种模式 | JDK 21、25                                   |
| 字节码    | 最多 37 个动态字节码用例、17 个畸形 class 的 JVM 校验 | JDK 11、17、21、25                           |
| 安装包    | 安装、类型声明、ESM、公开 API、许可证                 | Node.js 20、24                               |
| 模糊测试  | 2,000 轮固定种子字节码变异                            | Node.js 24、JDK 25                           |

## 许可证

[MIT](./LICENSE)
