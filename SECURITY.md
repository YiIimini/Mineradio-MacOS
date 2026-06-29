# Security Policy

## Supported Versions

当前维护 `v1.3.0` 及更新版本。

## v1.3.0 安全增强

- **CORS**: `Access-Control-Allow-Origin` 限制为 localhost 来源（不再使用 `*`）
- **CSP**: HTML 响应包含 Content-Security-Policy 头
- **安全头**: `X-Content-Type-Options: nosniff` / `X-Frame-Options: DENY`
- **错误边界**: 全局 `window.onerror` + `unhandledrejection` 防止静默崩溃

## Reporting a Vulnerability

通过 GitHub Issues 联系。不要在公开 Issue 中贴出 Cookie、Token、账号信息。

## Sensitive Data

Mineradio-MacOS 不会上传用户 Cookie。登录状态保存在本地用户数据目录。提交问题反馈时请移除：

- `.cookie` / `.qq-cookie`
- 本地音乐文件 / 用户账号截图
- 调试日志中的 Cookie、Token 或隐私路径
