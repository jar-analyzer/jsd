# jsd

[![Round-trip](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test.yml)
[![No debug info](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-nodebug.yml)
[![Modern Java](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-modern.yml)
[![Unit tests](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-unit.yml)
[![Package consumer](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/test-package.yml)
[![Fuzz](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml/badge.svg)](https://github.com/jar-analyzer/jsd/actions/workflows/fuzz.yml)

[English](./README.md) | **[简体中文](./README.zh-CN.md)**

TypeScript 实现的 Java `.class` 反编译库。以单个 ESM 产物运行于 Node.js 和浏览器，无运行时依赖，无 WebAssembly。

本项目将作为下一代 **jar-analyzer** 的底层反编译引擎。

支持常见控制流、lambda、嵌套类、record，以及截至 Java 25 的部分语法。

## 使用

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
