# 发布流程

## v1.3.0 发布边界

- `v1.3.0` 是基于 v1.2.0 的优化版本：代码去重、安全加固、前端模块化、GPU 节能、路由重构、100 项测试。
- 从当前源码执行 `npm run build:mac` 生成 macOS 安装包（DMG + ZIP），或 `npm run build:win` 生成 Windows NSIS 安装包。
- 安装包样式沿用 `docs/INSTALLER_STYLE.md` 的中文极简黑白蓝格式。

## 发布前检查

- `package.json` 版本号确认
- `mineradio.update.owner/repo` 指向 `YiIimini/Mineradio-MacOS`
- `.cookie`、`.qq-cookie`、`updates/`、`node_modules/`、旧 `dist/` 未进入 git
- `npm test` 100 项全部通过
- `node --check server.js` 语法检查通过
- 执行 `npm run build:mac` 生成 macOS 安装包（arm64 + x64）
- 生成并记录 SHA256

## GitHub Release

```text
Tag:    v1.3.0
Title:  Mineradio-MacOS v1.3.0
Assets: Mineradio-MacOS-1.3.0-mac-arm64.dmg
        Mineradio-MacOS-1.3.0-mac-x64.dmg
        Mineradio-MacOS-1.3.0-mac-arm64.zip
        Mineradio-MacOS-1.3.0-mac-x64.zip
        latest-mac.yml
        SHA256SUMS.txt
```
