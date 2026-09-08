# Security Policy / 安全策略

## Supported Versions / 支持的版本

Only the latest release is supported. / 仅支持最新发布版本。

## Reporting a Vulnerability / 报告漏洞

Please report vulnerabilities through [GitHub private security advisories](https://github.com/jar-analyzer/jsd/security/advisories/new). Do not open a public issue for security problems.

请通过 [GitHub 私有安全通告](https://github.com/jar-analyzer/jsd/security/advisories/new) 报告漏洞，不要以公开 issue 形式报告安全问题。

We aim to acknowledge reports within 72 hours and will keep you informed about the fix and release schedule. Reports that are accepted will be credited in the release notes if you wish.

我们会在 72 小时内确认收到报告，并同步修复与发布计划。如你愿意，接受的报告会在版本说明中致谢。

## Scope / 范围

jsd runs in the browser or Node.js with no file-system, network, or shell access. It parses untrusted `.class` bytes, so crashes or excessive memory use caused by malformed input are treated as regular bugs — please file them as normal issues. Vulnerability reports are for issues with security impact beyond that, such as XSS via the demo page.

jsd 运行于浏览器或 Node.js，不访问文件系统、网络与 shell。它解析不可信的 `.class` 字节，因此畸形输入导致的崩溃或内存占用过高按普通缺陷处理，请直接提 issue；安全漏洞报告适用于影响超出该范围的问题，例如演示页面的 XSS。
