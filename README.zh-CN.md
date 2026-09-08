# jsd

[![Round-trip](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml)
[![No debug info](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml)
[![Modern Java](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml)
[![Unit tests](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml)
[![Package consumer](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml)
[![Fuzz](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml)

[English](./README.md) | **[简体中文](./README.zh-CN.md)**

TypeScript 实现的 Java `.class` 反编译库。以单个 ESM 产物运行于 Node.js 和浏览器，无运行时依赖，无 WebAssembly。

**轻量接入：仅需引入一个约 238 KB 的 JS 文件（gzip 后约 72 KB），即可反编译 Java `.class` 文件。** 零运行时依赖，无需 WebAssembly，无需安装 Java。

体积基于当前压缩后的 `dist/jsd.min.js` 实测：gzip 前约 238 KB（0.238 MB），gzip 后约 72 KB（0.072 MB）。

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

默认不限制输入大小。需要限制时，可设置每个 `.class` 文件的大小上限，例如 10 MB：

```js
const result = decompileClassFile(data, { maxInputBytes: 10 * 1000 * 1000 });
```

文件超限时会报错，批量处理时会记录错误并继续处理其他文件。

批量处理还可用 `maxTotalInputBytes` 限制已加载文件的总大小，用 `maxClasses` 限制已加载的类数量。`maxOutputChars` 限制生成源码的字符数，`maxWork` 和 `timeoutMs` 分别限制处理工作量和耗时。以上限制均为可选。

## 测试

数量按当前测试集统计，现代 Java 和动态字节码用例根据 JDK 版本选择。往返测试会编译并执行原始与恢复的 Java 源码，再对比输出。

| 测试套件     | 用例 / 轮次 | 覆盖内容                                                              | CI 环境               |
| ------------ | ----------- | --------------------------------------------------------------------- | --------------------- |
| 单元测试     | 216         | 解析、类型推断、资源限额、诊断与 Demo 行为；格式及浏览器产物一致性    | Node.js 24            |
| 往返测试     | 138         | 求值顺序、switch 贯穿、异常清理与资源管理                             | JDK 8、11、17、21、25 |
| 无调试信息   | 138         | 同一套往返用例，编译时去除调试信息                                    | JDK 8、17、25         |
| 现代 Java    | 最多 14     | record、sealed、模式匹配等 Java 9–25 语法，覆盖有、无调试信息两种模式 | JDK 21、25            |
| 动态字节码   | 最多 37     | 动态常量、字符串拼接与动态 switch 的运行行为                          | JDK 11、17、21、25    |
| JVM 对照校验 | 17          | 畸形 StackMap 帧、异常表与指令操作数，对照 JVM 的拒绝结果             | JDK 11、17、21、25    |
| 安装包测试   | —           | 安装打包产物，检查 TypeScript 声明、ESM 导入、公开 API 和许可证       | Node.js 20、24        |
| 模糊测试     | 2,000 轮    | 固定种子的字节码变异，监测崩溃及超时                                  | Node.js 24、JDK 25    |

## 许可证

[MIT](./LICENSE)
