# jsd

[![Round-trip](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml)
[![No debug info](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml)
[![Modern Java](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml)
[![Unit tests](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml)
[![Package consumer](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml)
[![Fuzz](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml)

[English](./README.md) | **[简体中文](./README.zh-CN.md)**

TypeScript 实现的 Java `.class` 反编译库。以单个 ESM 产物运行于 Node.js 和浏览器，无运行时依赖，无 WebAssembly。

**轻量接入：仅需引入一个约 217 KB 的 JS 文件（gzip 后约 65 KB），即可反编译 Java `.class` 文件。** 零运行时依赖，无需 WebAssembly，无需安装 Java。

体积基于当前压缩后的 `dist/jsd.min.js` 实测：gzip 前约 217 KB（0.217 MB），gzip 后约 65 KB（0.065 MB）。

[在线体验](https://jar-analyzer.github.io/jsd/)

本项目将作为下一代 **jar-analyzer** 的底层反编译引擎。

支持常见控制流、lambda、嵌套类、record，以及截至 Java 25 的部分语法。

## 使用

已发布到 npm：[`@jar-analyzer/jsd`](https://www.npmjs.com/package/@jar-analyzer/jsd)，当前版本为 **1.0.3**。

### 1. 浏览器

通过 CDN 加载，选择 `.class` 文件即可查看源码。

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

保存为 `example.mjs`，运行 `node example.mjs`：

```js
import { readFileSync } from 'node:fs';
import { decompileClassFile } from '@jar-analyzer/jsd';

const result = decompileClassFile(readFileSync('Example.class'));
console.log(result.source);
```

开发版还支持 `maxInputBytes`（单个 class 的字节数）、`maxWork`（字节码字节数及处理步数）、`maxOutputChars`、`timeoutMs` 和 `signal`，默认不设限制。单文件接口超限时抛出 `DecompileLimitError`；批量接口返回 `RESOURCE_LIMIT` 或 `DECOMPILE_CANCELLED` 诊断。工作量、时间和输出预算由整批共享，每次反编译重新计数。

这些检查是协作式的；需要从其他线程中断同步任务时，应使用 Worker。`success` 表示没有报告错误，不代表已验证源码可编译或行为等价。

## 测试

| CI 套件    | 覆盖内容                                                                             | 环境                  |
| ---------- | ------------------------------------------------------------------------------------ | --------------------- |
| 单元测试   | 字节码解析、控制流、Java 字面量、诊断、Demo 状态与压缩包处理；格式及浏览器产物一致性 | Node.js 24            |
| 往返测试   | 编译并执行原始与恢复的 Java 源码，对比输出及用例预期                                 | JDK 8、11、17、21、25 |
| 无调试信息 | 不含调试信息的字节码往返测试                                                         | JDK 8、17、25         |
| 现代 Java  | Java 9–25 的部分语法，覆盖有、无调试信息两种模式                                     | JDK 21、25            |
| 安装包测试 | 安装打包产物，检查 TypeScript 声明、ESM 导入、公开 API 和许可证                      | Node.js 20、24        |
| 模糊测试   | 固定种子的 2,000 次字节码变异，监测崩溃及超时                                        | Node.js 24、JDK 25    |

## 许可证

[MIT](./LICENSE)
