# MineradioMacOS Project Rules

## Project Identity

MineradioMacOS 是跨平台 Electron 桌面音乐播放器（macOS 优先），核心体验包括搜索、播放、歌单、歌词、3D 歌单架、粒子视觉预设、DIY 视觉控制台和 GitHub 自动更新。

- 项目目录：`/Users/x/Documents/Claude/MineradioMacOS/`
- GitHub 仓库：`https://github.com/YiIimini/Mineradio-MacOS`
- 当前版本：`v1.4.0`
- 原作者：XxHuberrr ｜ macOS 移植与维护：YiIimini

## 启动方式

```bash
npm start                   # 开发运行
npm test                    # 100 项测试
npm run build:mac           # macOS 打包
npm run build:win           # Windows 打包
```

## 架构要点

- 后端 `server.js` — 路由表 46 映射 (O(1) 调度)，CSP `worker-src blob:`
- 前端 `public/index.html` + `public/js/app.js` (~17,800 行)
- 外部模块: `beat-analysis.js` / `shelf-3d.js` / `login.js` / `gesture.js`
- 炫酷模块: `public/mineradio-terrain.js` (柱形/泡沫/不规则，5 套配色)
- 工具库: `server/utils.js` (统一 18+ 共享函数)
- 测试: `tests/` (100 项, `node --test`)
- Three.js r160 (vendored, WebGL 2.0), 无 post-processing
- GPU: 质量档位 (eco/balanced/high/ultra) + FPS 分级 + frustum 剔除 + 跳帧
- 手势: MediaPipe Hands，三选一模式（视觉/控歌/关闭），指头识别，阈值可调
- 桌面浮层: 歌词浮窗 + 壁纸模式，全屏自动暂停

关键文档：`AGENTS.md` / `docs/PROJECT_MEMORY.md` / `docs/GPU_OPTIMIZATION_PLAN.md` / `CHANGELOG.md` / `README.md`

## Repository Layout

```text
MineradioMacOS/
├─ public/
│  ├─ index.html + js/app.js (~17,800 行)
│  ├─ js/beat-analysis.js / shelf-3d.js / login.js / gesture.js
│  ├─ mineradio-terrain.js
│  └─ vendor/ (Three.js r160, GSAP, music-tempo)
├─ desktop/             # Electron main/preload + Swift helpers
├─ server/              # utils.js + qqmusic.js + weather.js + podcast.js
├─ server.js (路由表 46 映射)
├─ dj-analyzer.js / bilibili-api.js / kugou-api.js
├─ tests/ (100 项) / tests/bug/ (错误日志)
├─ docs/ (GPU_OPTIMIZATION_PLAN.md, GLASS_SVG_TEXTURE.md, etc.)
└─ package.json
```

## Commands

```bash
npm start                   # 开发运行
npm test                    # 100 项测试
npm run build:mac -- --arm64 --x64  # macOS DMG+ZIP 双架构
```

## GPU 质量档位

| 档位 | 柱体数 | 粒子网格 | 光照 | 帧更新 | 适用场景 |
|---|---|---|---|---|---|
| eco | 3,136 | ≤88² | 1 ambient + 1 dir | 隔帧 | 省电/低端机 |
| balanced | 6,400 | ≤118² | 1 ambient + 1 dir | 隔帧 | 日常使用（默认） |
| high | 9,216 | ≤148² | 全光照 + spark | 每帧 | 高性能 |
| ultra | 12,544 | ≤183² | 全光照 + spark | 每帧 | 台式机/插电 |

## 炫酷配色

在视觉控制台选择炫酷预设（7/8/9）后出现配色按钮：
- `nocturnal` — 暗夜蓝红（默认）
- `ink_wash` — 水墨青墨宣纸白
- `royal` — 紫金
- `ocean_reef` — 深海珊瑚
- `aurora` — 极光绿紫

## 手势控歌

三选一摄像头模式：关闭 / 手势触碰（视觉） / 手势控歌（播放）。指头识别：
- ✊ 拳头 → 播放
- ☝ 食指 → 下一首
- ✋ 手掌 → 暂停

阈值（拳头/食指/手掌）、保持时间、冷却间隔均可在 UI 调整。帮助弹窗图片由 `build/render-help-image.js` (Electron headless) 生成。

## Release Workflow

1. 更新 `package.json` 版本号
2. 更新 `CHANGELOG.md`
3. `npm test` 确认 100/100
4. `npm run build:mac`
5. 创建 GitHub Release `vX.Y.Z`

## User Preferences

- 交流语言：中文。
- 用户偏好：少废话，直接做，修完验证，能发布就一起发布。
- UI 审美：精致、暗色、高级、流畅，拒绝廉价渐变、过度透明、错位、闪烁和卡顿。
- 视觉质量定义：质感、丝滑度、帧数稳定同时成立；性能优化不能牺牲既有质感。
- 3D 特效原则：必须考虑三维空间立体感，不同元素应有各自 Z-depth，正面和侧面观察都应自然。优先使用真实 3D 空间分离（独立 plane + Z-depth），不用平面 canvas 模拟。详见 memory `3d-spatial-depth-principle`。
- 玻璃质感：当前播放器 SVG 玻璃质感是黄金版本，详见 `docs/GLASS_SVG_TEXTURE.md`。
- 备份策略：不删除旧资料；历史内容移动到归档目录。
- 工作目录：`/Users/x/Documents/Claude/MineradioMacOS/`

## Guardrails

- 不要随意重写 `public/index.html` 的大块视觉系统；先定位已有函数和状态。
- 不要动电影视觉系统，除非用户明确点名。
- 不要恢复旧的侧边栏闪烁、控制台播放暂停失效、3D 歌单架强制切回星河等问题。
- 不要把搜索结果、左侧歌单、3D 歌单架的性能优化做成一次性渲染全部内容。
- 不要把用户认可的玻璃质感改成普通毛玻璃或廉价透明面板。
- 不要用平面 canvas 模拟来替代真实 3D Z-depth 分层。
- 修改炫酷渲染时保持灯光、配色、相机位置的原始比例感，避免过度提亮导致层次丢失。
