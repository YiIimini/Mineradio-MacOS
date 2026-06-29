# Mineradio-MacOS Project Rules

## Project Identity

Mineradio-MacOS 是跨平台 Electron 桌面音乐播放器（macOS 优先），核心体验包括搜索、播放、歌单、歌词、3D 歌单架、粒子视觉预设、DIY 视觉控制台和 GitHub 自动更新。

- 项目目录：`/Users/x/Documents/ClaudeCode/Mineradio-MacOS/`
- GitHub 仓库：`https://github.com/YiIimini/Mineradio-MacOS`
- 当前版本：`v1.3.0`
- 原作者：XxHuberrr ｜ macOS 移植与维护：YiIimini

## 启动方式

```bash
npm start                   # 开发运行
npm test                    # 100 项测试
npm run build:mac           # macOS 打包
npm run build:win           # Windows 打包
```

## 架构要点

- 后端 `server.js` — 路由表 46 映射 (O(1) 调度)
- 前端 `public/index.html` (862 行) + `public/js/app.js` (17,770 行)
- 外部模块: `beat-analysis.js` / `shelf-3d.js` / `login.js` / `gesture.js`
- 工具库: `server/utils.js` (统一 18+ 共享函数)
- 测试: `tests/` (100 项, `node --test`)
- Three.js r128 (vendored), 无 post-processing
- GPU: FPS 分级 (60/45/30 idle) + 层级检测

关键文档：`AGENTS.md` / `docs/PROJECT_MEMORY.md` / `CHANGELOG.md` / `RELEASE.md`

## Repository Layout

```text
Mineradio-MacOS/
├─ public/
│  ├─ index.html (862 行)  + js/app.js (17,770 行)
│  ├─ js/beat-analysis.js / shelf-3d.js / login.js / gesture.js
│  └─ vendor/ (Three.js r128, GSAP, music-tempo)
├─ desktop/             # Electron main/preload + Swift helpers
├─ server/              # utils.js + qqmusic.js + weather.js + podcast.js
├─ server.js (路由表 46 映射)
├─ dj-analyzer.js / bilibili-api.js / kugou-api.js
├─ tests/ (100 项)
└─ package.json
```

## Commands

```bash
npm start                   # 开发运行
npm test                    # 100 项测试
npm run build:mac           # macOS DMG+ZIP
```

## Release Workflow

1. 更新 `package.json` 版本号
2. 更新 `CHANGELOG.md`
3. `npm test` 确认 100/100
4. `npm run build:mac`
5. 创建 GitHub Release `vX.Y.Z`
3. 运行语法/空白检查。
4. 执行 `npm run build:win`。
5. 上传 GitHub Release 资产：
   - `dist/Mineradio-x.y.z-Setup.exe`
   - `dist/Mineradio-x.y.z-Setup.exe.blockmap`
   - `dist/latest.yml`
   - 需要的 `Mineradio-旧版本-x.y.z.json` 轻量补丁
6. 0.9 系列补丁跳过；1.0.x 系列可按需生成跨小版本补丁。

GitHub CLI / `gh auth` / Release 上传需要代理时，优先使用可用本机代理 `127.0.0.1:10808`；不要再走旧代理 `127.0.0.1:26001`，该端口会连接拒绝。临时命令可先清空 `HTTP_PROXY`/`HTTPS_PROXY`，再设为 `http://127.0.0.1:10808`。

## User Preferences

- 交流语言：中文。
- 用户偏好：少废话，直接做，修完验证，能发布就一起发布。
- UI 审美：精致、暗色、高级、流畅，拒绝廉价渐变、过度透明、错位、闪烁和卡顿。
- 视觉质量定义：质感、丝滑度、帧数稳定同时成立；性能优化不能牺牲既有质感。
- 玻璃质感：当前播放器 SVG 玻璃质感是黄金版本，详见 `docs/GLASS_SVG_TEXTURE.md`。
- 备份策略：不删除旧资料；历史内容移动到归档目录。
- 工作目录：`/Users/x/Documents/ClaudeCode/Mineradio-MacOS/`

## Memory Protocol

当用户说“保留”“这个做得很好”“我喜欢”“记住这个”“保存一下”“以后别忘了”或同类表达时：

1. 判断用户认可的是代码、视觉效果、交互流程、发布流程还是工作习惯。
2. 将结论追加到 `docs/PROJECT_MEMORY.md` 的对应区块。
3. 如果是玻璃 SVG、粒子预设、3D 歌单架等脆弱视觉实现，同时更新对应专项文档。
4. 记录日期、涉及文件、关键参数、不要再改坏的边界。
5. 如果本轮有代码提交，把记忆文档一起提交；如果只是记忆整理，单独提交也可以。

## Guardrails

- 不要随意重写 `public/index.html` 的大块视觉系统；先定位已有函数和状态。
- 不要动电影视觉系统，除非用户明确点名。
- 不要恢复旧的侧边栏闪烁、控制台播放暂停失效、3D 歌单架强制切回星河等问题。
- 不要把搜索结果、左侧歌单、3D 歌单架的性能优化做成一次性渲染全部内容。
- 不要把用户认可的玻璃质感改成普通毛玻璃或廉价透明面板。
