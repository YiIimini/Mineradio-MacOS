# Mineradio macOS 深度分析报告

> 版本：v1.2.0 (macOS 重构版)
> 分析日期：2026-06-29
> 源码地址：`/Users/x/Documents/ClaudeCode/Mineradio-MacOS`

---

## 目录

1. [项目概览](#1-项目概览)
2. [macOS 平台适配现状分析](#2-macos-平台适配现状分析)
3. [现有 Bug 分类与影响评估](#3-现有-bug-分类与影响评估)
4. [性能与资源占用分析](#4-性能与资源占用分析)
5. [安全性分析](#5-安全性分析)
6. [代码架构质量评估](#6-代码架构质量评估)
7. [后期功能完善路线图](#7-后期功能完善路线图)
8. [附录：关键文件清单](#8-附录关键文件清单)

---

## 1. 项目概览

### 1.1 技术栈

| 层级 | 技术 | 版本/说明 |
|------|------|-----------|
| 运行时 | Electron | ^33.4.11 |
| 构建工具 | electron-builder | ^26.15.3 |
| 前端 | 原生 HTML/CSS/JS (单文件 27k 行) | Three.js r128, GSAP 3.15 |
| 后端服务 | Node.js HTTP Server (server.js 4k+ 行) | 内嵌于 Electron 主进程 |
| 音频解码 | mpg123-decoder | ^1.0.3 |
| 3D 渲染 | Three.js | r128 (2021年旧版) |
| 音乐 API | NeteaseCloudMusicApi | ^4.32.0 |
| 音乐源 | 网易云、QQ音乐、B站、酷狗 | 自研接口封装 |

### 1.2 项目结构

```
Mineradio-MacOS/
├── desktop/
│   ├── main.js          # Electron 主进程 (1577行)
│   ├── preload.js        # 主窗口预加载脚本
│   └── overlay-preload.js # 桌面歌词/壁纸覆盖层预加载
├── public/
│   ├── index.html        # 主 UI (27189行!! 单文件)
│   ├── desktop-lyrics.html # 桌面歌词页面
│   ├── wallpaper.html    # 壁纸模式页面
│   ├── mineradio-terrain.js # 地形生成
│   └── vendor/           # 第三方库 (Three.js, GSAP, music-tempo)
├── server.js             # HTTP API 服务 (4191行)
├── dj-analyzer.js        # 音频节奏分析引擎 (865行)
├── bilibili-api.js       # B站搜索/播放接口
├── kugou-api.js          # 酷狗搜索/播放接口
├── build/
│   ├── after-pack.js     # 打包后处理 (Windows rcedit 注入)
│   └── icon.icns / icon.ico / icon.png
└── docs/                 # 项目文档与设计记忆
```

### 1.3 核心功能矩阵

| 功能 | 状态 | 依赖 |
|------|------|------|
| 网易云音乐搜索/播放 | ✅ 正常 | NeteaseCloudMusicApi |
| QQ音乐搜索/播放 | ✅ 正常 | 自研接口 |
| B站视频搜索 | ✅ 正常 | bilibili-api.js |
| 酷狗音乐搜索 | ✅ 正常 | kugou-api.js |
| 天气电台 | ✅ 正常 | Open-Meteo API |
| 3D 粒子可视化 | ✅ 正常 | Three.js + 自研 |
| 3D 歌单架 | ✅ 正常 | Three.js |
| 桌面歌词 | ⚠️ macOS 受限 | PowerShell 轮询(仅Win) |
| 壁纸模式 | ⚠️ macOS 受限 | WorkerW 附加(仅Win) |
| 自动更新 | ⚠️ macOS 未测试 | GitHub Releases + DMG |
| 全局快捷键 | ⚠️ macOS 部分可用 | Electron globalShortcut |
| macOS 媒体键 | ✅ 已添加 | MediaPlayPause 等 |
| Dock 菜单 | ✅ 已添加 | app.dock.setMenu |

---

## 2. macOS 平台适配现状分析

### 2.1 已完成的适配项 ✅

#### 2.1.1 Electron 主进程适配
- **macOS Dock 菜单** (`desktop/main.js:1514-1523`)：已添加播放/暂停、上一首、下一首、显示窗口
- **macOS 媒体键** (`desktop/main.js:1526-1545`)：已注册 MediaPlayPause、MediaPreviousTrack、MediaNextTrack
- **睡眠监听** (`desktop/main.js:1527-1530`)：系统休眠时自动暂停播放
- **窗口控制按钮隐藏** (`public/index.html:54`)：macOS 下隐藏 Windows 风格的最小化/最大化/关闭按钮
- **titleBarStyle** (`desktop/main.js:1429`)：使用 `hiddenInset` 适配 macOS 红绿灯按钮区域
- **Chromium 性能开关** (`desktop/main.js:58-62`)：启用 Skia Graphite (Metal 后端)，禁用 MacWebContentsOcclusion

#### 2.1.2 构建配置适配
- **macOS 构建目标** (`package.json:75-97`)：已配置 DMG + ZIP 输出，支持 arm64/x64 双架构
- **macOS 分类**：`public.app-category.music`
- **图标**：`build/icon.icns`

### 2.2 严重平台缺陷 🔴

#### 2.2.1 桌面歌词中键锁定完全不可用 (P0)

**位置**: `desktop/main.js:880-936`

```js
function startDesktopLyricsMousePoller() {
  if (process.platform !== 'win32' || desktopLyricsMousePoller) return;  // ← macOS 直接跳过
  // ... 使用 PowerShell + GetAsyncKeyState(4) 轮询中键 ...
}
```

**问题**: macOS 上 `startDesktopLyricsMousePoller()` 直接返回，导致桌面歌词的**中键锁定/解锁功能完全失效**。在 macOS 上，桌面歌词窗口创建后无法通过鼠标中键切换穿透/锁定状态。

**影响范围**: 桌面歌词功能的核心交互缺失，用户无法在 macOS 上正常使用桌面歌词锁定态。

#### 2.2.2 壁纸模式 WorkerW 附加完全不可用 (P1)

**位置**: `desktop/main.js:1054-1098`

```js
function attachWallpaperToWorkerW(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return;  // ← macOS 直接跳过
  // ... 使用 PowerShell + user32.dll 将窗口附着到 WorkerW ...
}
```

**问题**: WorkerW 是 Windows 桌面壁纸层的专有概念，macOS 没有等价物。整个壁纸模式在 macOS 上只能作为普通窗口运行，无法真正嵌入桌面壁纸层。

**影响范围**: 壁纸模式功能在 macOS 上形同虚设。

#### 2.2.3 桌面快捷方式创建不可用 (P2)

**位置**: `desktop/main.js:285-322`

```js
function shouldEnsureDesktopShortcut() {
  if (process.platform !== 'win32') return false;  // ← macOS 直接跳过
  // ... 创建 .lnk 文件 ...
}
```

**问题**: macOS 使用 `.app` 和 Dock，不需要 `.lnk` 快捷方式。当前直接跳过是正确的，但缺少 macOS 原生的 Dock 固定提示。

#### 2.2.4 安装器/更新机制为 Windows 设计 (P1)

**位置**: `package.json:40-67`, `server.js:367-386`

- NSIS 安装器配置完全针对 Windows
- 更新资产选择逻辑优先 `.exe/.msi`，其次 `.zip/.7z`
- macOS 的 DMG 安装包发布流程未经验证

```js
// server.js:369-371 - 资产选择偏好
const preferred = list.find(a => /\.(exe|msi)$/i.test(a && a.name || ''))
  || list.find(a => /\.(zip|7z)$/i.test(a && a.name || ''))
  || list[0];
```

**问题**: 自动更新下载逻辑在 macOS 上可能下载错误的资产（`.exe`），或无法正确打开 `.dmg` 文件。

#### 2.2.5 代码签名和公证缺失 (P0)

**位置**: `package.json:95-96`

```json
"hardenedRuntime": false,
"gatekeeperAssess": false
```

**问题**: 
- `hardenedRuntime: false` — 禁用 macOS 强化运行时，降低安全性
- `gatekeeperAssess: false` — 跳过 Gatekeeper 评估，用户打开时会被 macOS 阻止
- 缺少 Apple Developer 代码签名，用户需要通过右键→打开来绕过 Gatekeeper
- 缺少公证 (Notarization)，无法通过 macOS 的安全检查

### 2.3 中等平台适配问题 🟡

#### 2.3.1 UA 字符串硬编码为 Windows

**位置**: `server.js:61`

```js
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...';
```

**问题**: 
- QQ音乐、网易云等服务的反爬虫机制可能根据 UA 判断平台
- 可能导致部分接口在 macOS 上返回不同结果
- 应使用当前平台的真实 UA 或 macOS UA

#### 2.3.2 字体渲染差异

**位置**: `public/index.html:26`

```css
--font-sans:"Noto Sans SC","PingFang SC","HarmonyOS Sans SC",...;
```

**问题**:
- macOS 上 `PingFang SC` 可用，但 `HarmonyOS Sans SC`、`Alibaba PuHuiTi` 通常不可用
- macOS 字体渲染引擎与 Windows 不同，同样的 CSS 在 macOS 上可能显示不同
- `-webkit-font-smoothing: antialiased` 在 macOS 上可能使文字过细

#### 2.3.3 窗口管理差异

**位置**: `desktop/main.js:1009-1012`

```js
desktopLyricsWindow.setAlwaysOnTop(true, 'screen-saver');
if (process.platform !== 'darwin') {
  desktopLyricsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}
```

**问题**:
- macOS 上桌面歌词窗口不会出现在所有工作区
- `setVisibleOnAllWorkspaces` 被显式跳过（兼容性考虑），但这是 macOS 核心需求
- 全屏空间 (Spaces) 管理未适配

#### 2.3.4 build/after-pack.js 仅支持 Windows

**位置**: `build/after-pack.js:44`

```js
if (context.electronPlatformName !== 'win32') return;
```

**问题**: rcedit 是 Windows 专用工具，用于注入图标和版本信息。macOS 打包时此步骤被跳过，但不影响功能。需确认 macOS 打包流程完整。

#### 2.3.5 全局快捷键冲突

**位置**: `desktop/main.js:153-185`

```js
globalShortcut.register(accelerator, ...)
```

**问题**:
- macOS 系统保留大量快捷键（如 Ctrl+左右箭头切换 Space）
- 用户自定义的全局快捷键可能与系统快捷键冲突
- macOS 的辅助功能权限请求未处理

### 2.4 轻微适配问题 🟢

- Cookie 存储路径使用 `app.getPath('userData')` 已自动适配各平台 ✅
- BeatMap 缓存路径使用 `~/Library/Caches/com.mineradio.desktop/beatmaps` 已适配 macOS ✅
- `app.on('window-all-closed')` 正确处理 macOS 的 `!== 'darwin'` 不退出 ✅
- `app.on('activate')` 正确处理 macOS Dock 点击重新创建窗口 ✅
- `requestSingleInstanceLock()` 正确处理单实例 ✅

---

## 3. 现有 Bug 分类与影响评估

### 3.1 P0 — 严重 Bug (影响核心功能)

| # | Bug 描述 | 位置 | 影响 |
|---|---------|------|------|
| 1 | **桌面歌词中键锁定 macOS 完全不可用** | `desktop/main.js:880` | macOS 桌面歌词核心交互缺失 |
| 2 | **代码签名/公证缺失导致 macOS 无法直接打开** | `package.json:95-96` | 用户需右键→打开，体验极差 |
| 3 | **Ctrl+/- 缩放卡住无法恢复** | 项目记忆 `PROJECT_MEMORY.md:194-198` | Zoom level 残留 `-1.0`，Ctrl++ 无效 |
| 4 | **更新下载优先选 .exe 资产** | `server.js:369` | macOS 可能下载错误的更新包 |
| 5 | **QQ音乐仅登录但无播放授权时弹误导提示** | `server.js:1501-1512`, QQ_MUSIC_INTERFACE_NOTES | 用户看到"未登录"但实际已登录 |

### 3.2 P1 — 重要 Bug (影响主要体验)

| # | Bug 描述 | 位置 | 影响 |
|---|---------|------|------|
| 6 | **壁纸模式在 macOS 上完全无桌面集成** | `desktop/main.js:1054` | 壁纸模式形同虚设 |
| 7 | **播放/暂停按钮偶发失效** | `public/index.html` (多处) | 天气电台、下一首后按钮不响应 |
| 8 | **播放器控制台在切歌时偶发不可点击** | `public/index.html` (playQueueAt) | UI 渲染异常拖死控制台 |
| 9 | **用户存档应用后切歌回退到上一个预设** | `public/index.html` (已修但需验证) | 视觉预设状态不稳定 |
| 10 | **全屏 DIY 悬浮入口遮挡热键按钮** | `public/index.html:77-85` (已修但需验证) | 全屏时操作受阻 |

### 3.3 P2 — 中等 Bug (影响边缘体验)

| # | Bug 描述 | 位置 | 影响 |
|---|---------|------|------|
| 11 | 3D 歌单详情页打开时歌词透明度跳亮 | `public/index.html` (shelfDetailLyricProfile) | 视觉闪烁 |
| 12 | 歌单加载失败时 shelf 重建误报错误 | `public/index.html` (makeShelfManager) | 用户看到虚假错误提示 |
| 13 | 右键歌单架时误唤出底部控制台 | `public/index.html` (setFocusZone) | 交互冲突 |
| 14 | 桌面歌词拖动后位置记忆不稳定 | `desktop/main.js:830-833` | 重启后位置偏移 |
| 15 | macOS 字体渲染导致 UI 文字过细/过粗 | `public/index.html` (-webkit-font-smoothing) | 视觉效果不一致 |

### 3.4 P3 — 轻微问题

| # | Bug 描述 | 位置 |
|---|---------|------|
| 16 | Emily 预设入场动画偶有卡顿跳帧 | `public/index.html` (Emily 相关) |
| 17 | 搜索栏 SVG 玻璃在黑底/亮底显示不一致 | `public/index.html` (control-glass) |
| 18 | 3D 歌单架滚动选择音效在无音频设备时静默 | `public/index.html` (playShelfSelectTick) |
| 19 | 封面渐变背景点击默认时才触发 | `public/index.html` (fx-background) |
| 20 | 播客 DJ 分析在超长音频(>2h)时 OOM 风险 | `dj-analyzer.js` |

---

## 4. 性能与资源占用分析

### 4.1 当前架构性能特点

#### 优势 ✅
- **深度睡眠模式**：窗口最小化/隐藏时降到极低帧率和 DPR
- **Chromium 性能开关**：启用了 GPU rasterization、zero-copy、Metal 后端 (macOS)
- **后台节流豁免**：`disable-background-timer-throttling`、`disable-renderer-backgrounding`
- **非焦点可见窗口不降级**：用户确认副屏/非焦点不降低帧率
- **更新下载流式处理**：不一次性加载到内存

#### 问题 ❌

| 问题 | 详情 | 影响 |
|------|------|------|
| **单文件 27k 行 HTML** | `public/index.html` 包含所有 CSS + JS + HTML | 加载慢、解析慢、维护困难 |
| **Three.js r128 (2021)** | 已有大量性能优化和安全修复的后续版本 | WebGL 性能落后 |
| **全量服务器单文件** | `server.js` 4191 行无模块拆分 | 内存占用、启动慢 |
| **无虚拟化列表** | 歌单列表一次性渲染所有项目 | 大数据集卡顿 |
| **播客 DJ 分析内存** | 超长音频全量解码到内存 | OOM 风险 |
| **字体加载** | Google Fonts 外链加载 5 个字体族 | 首屏渲染阻塞 |

### 4.2 macOS 特定性能考虑

| 方面 | 分析 |
|------|------|
| **Metal vs OpenGL** | Three.js r128 在 macOS 上可能使用旧 OpenGL 后端。macOS 10.14+ 已废弃 OpenGL，应确认使用 Metal (WebGL via Metal) |
| **App Nap** | 已通过 `NSAppSleepDisabled` 禁用，避免后台暂停音频 |
| **内存压缩** | macOS 内存压缩对 Electron 应用效果较好，但 27k 行 HTML 解析占用仍高 |
| **能效影响** | 3D 粒子渲染持续消耗 GPU，即使在非焦点窗口 (已修复)，但 macOS 活动监视器会显示"高能耗" |

### 4.3 实测建议

- **内存基准**：Electron 空载 ~150MB + Three.js 场景 ~100MB + 音频解码 ~50MB = 预期空闲 ~300MB
- **CPU 占用**：空闲 <5%，播放音频 + 3D 渲染预期 15-35%
- **GPU 占用**：粒子数量 × canvas 分辨率为主要因素，`particleScale` 默认 1.55

---

## 5. 安全性分析

### 5.1 已有安全措施 ✅

- **Context Isolation**: 主窗口和覆盖层窗口都启用了 `contextIsolation: true`
- **Node Integration 禁用**: 所有窗口 `nodeIntegration: false`
- **沙箱**: 登录窗口启用 `sandbox: true`
- **文件路径安全**: 补丁路径有严格的目录遍历防护 (`PATCH_ALLOWED_ROOTS`, `safePatchRelativePath`)
- **Cookie 本地存储**: 仅保存在用户数据目录
- **自动更新校验**: SHA256/SHA512 digest 校验

### 5.2 安全缺陷 🔴

| # | 缺陷 | 详情 |
|---|------|------|
| 1 | **无代码签名** | macOS 上任何用户都可修改 .app 内容 |
| 2 | **hardenedRuntime: false** | 未启用 macOS 强化运行时，缺少 entitlements |
| 3 | **无公证 (Notarization)** | macOS Gatekeeper 会阻止打开 |
| 4 | **主窗口 sandbox: false** | 渲染进程未沙箱化 |
| 5 | **CORS 全开** | `Access-Control-Allow-Origin: *` 无限制 |
| 6 | **本地 HTTP 服务器** | 监听 `127.0.0.1` 但无 token/鉴权 |
| 7 | **更新镜像未验证 TLS 证书** | 国内加速线路可能中间人攻击 |
| 8 | **Electron 33.x 已知漏洞** | 需持续跟踪 Electron 安全公告 |

### 5.3 隐私考量

- 天气定位通过 IP-API.com，用户 IP 会泄露给第三方
- 网易云/QQ 音乐的请求通过本地代理，音乐服务商可看到用户 IP
- 无遥测/分析 SDK 集成 ✅

---

## 6. 代码架构质量评估

### 6.1 架构优势

- **功能完备**：搜索、播放、歌词、3D 视觉、天气电台一应俱全
- **自研音频分析引擎**：`dj-analyzer.js` 提供离线拍点检测，不依赖外部服务
- **多音源热插拔**：网易云、QQ音乐、B站、酷狗已实现，架构可扩展
- **更新系统完善**：支持完整安装包 + 快速补丁 + 多镜像容错
- **错误处理细致**：`classifyUpdateError()` 提供中文错误分类
- **用户状态持久化**：视觉预设、歌词布局、用户存档完整保存

### 6.2 架构缺陷

| 缺陷 | 严重度 | 说明 |
|------|--------|------|
| **单文件巨石** | 🔴 严重 | `public/index.html` 27189 行，不可维护 |
| **服务端巨石** | 🔴 严重 | `server.js` 4191 行，路由、业务、工具混杂 |
| **无模块化前端** | 🔴 严重 | 所有 UI 逻辑、Three.js 场景、CSS 在一个文件 |
| **无测试** | 🟡 中等 | 项目完全没有自动化测试 |
| **无 TypeScript** | 🟡 中等 | 大型 JS 项目无类型安全保障 |
| **重复代码** | 🟡 中等 | `classifyUpdateError` 和 `requestText` 有重复模式 |
| **无日志系统** | 🟢 轻微 | 使用 `console.log/warn/error`，无级别控制和文件输出 |
| **硬编码值多** | 🟢 轻微 | 音质参数、颜色值、超时时间散布在代码中 |

### 6.3 macOS 代码质量评估

- 平台判断 (`process.platform === 'darwin'`) 使用得当 ✅
- 但 macOS 分支多为跳过功能，而非提供替代实现 ❌
- `after-pack.js` 仅 Windows 处理 ✅ (macOS 不需要 rcedit)
- Duck 菜单和媒体键只在 macOS 初始化 ✅

---

## 7. 后期功能完善路线图

### 7.1 第一阶段：macOS 基础可用性 (P0，预计 2-3 周)

**目标**: macOS 用户能正常安装、打开、使用核心功能

| 优先级 | 任务 | 说明 |
|--------|------|------|
| 🔴 P0 | Apple Developer 账号 + 代码签名 | 获取 Developer ID，配置 electron-builder 签名 |
| 🔴 P0 | macOS 公证 (Notarization) | 配置 `afterSign` hook 提交 Apple 公证 |
| 🔴 P0 | 修复更新下载的 macOS 资产选择 | 优先级改为 `.dmg` > `.zip` |
| 🔴 P0 | 修复桌面歌词中键锁定 | 用 macOS 原生方案替代 PowerShell 轮询 |
| 🟡 P1 | 开启 hardenedRuntime | 配置必要的 entitlements (audio-input, camera 等) |
| 🟡 P1 | macOS DMG 背景美化 | 添加 DMG 背景图、Applications 快捷方式 |

### 7.2 第二阶段：macOS 原生体验 (P1，预计 4-6 周)

**目标**: macOS 用户获得原生级别的应用体验

| 优先级 | 任务 | 说明 |
|--------|------|------|
| 🟡 P1 | **MPNowPlayingInfoCenter 集成** | 系统媒体控制中心显示歌曲信息 |
| 🟡 P1 | **MPRemoteCommandCenter 集成** | 控制中心/耳机线控播放控制 |
| 🟡 P1 | **菜单栏应用模式** | 可选最小化到菜单栏，显示当前歌曲 |
| 🟡 P1 | **Touch Bar 支持** | 播放控制、歌词预览 |
| 🟡 P1 | **原生窗口材质** | 使用 `NSVisualEffectView` 替代 CSS 毛玻璃 |
| 🟢 P2 | **AirPlay 音频输出** | 选择 AirPlay 设备作为音频输出 |
| 🟢 P2 | **Now Playing 小部件** | macOS 通知中心小部件 |

### 7.3 第三阶段：壁纸模式重设计 (P1，预计 3-4 周)

**目标**: 在 macOS 上提供真正的桌面壁纸体验

| 优先级 | 任务 | 说明 |
|--------|------|------|
| 🟡 P1 | **macOS 桌面壁纸方案调研** | 研究 NSWindow level + `kCGDesktopWindowLevel` |
| 🟡 P1 | **透明玻璃模式 MVP** | 主窗口设为透明 + 鼠标穿透 + 控制台浮层 |
| 🟡 P1 | **多桌面/Space 感知** | 跟随用户 Space 切换 |
| 🟢 P2 | **动态壁纸导出** | 导出为 macOS `.heic` 动态壁纸格式 |
| 🟢 P2 | **Wallpaper Engine 轻联动** | 如果用户有 Wallpaper Engine Mac 版 |

### 7.4 第四阶段：代码架构现代化 (P1，预计 6-8 周)

**目标**: 提升代码可维护性和开发效率

| 优先级 | 任务 | 说明 |
|--------|------|------|
| 🟡 P1 | **前端模块化拆分** | `index.html` 拆分为 JS 模块 + CSS 文件 |
| 🟡 P1 | **服务端模块化拆分** | `server.js` 按功能拆分为 routers、services、utils |
| 🟡 P1 | **Three.js 升级** | r128 → r170+，使用 ES module 导入 |
| 🟡 P1 | **构建工具引入** | Vite/Webpack 打包前端资源 |
| 🟢 P2 | **TypeScript 迁移** | 渐进式引入类型检查 |
| 🟢 P2 | **自动化测试** | 至少 server.js 的 API 测试 |
| 🟢 P2 | **ESLint + Prettier** | 代码风格统一 |

### 7.5 第五阶段：功能扩展 (P2，长期)

| 优先级 | 任务 | 说明 |
|--------|------|------|
| 🟢 P2 | **Apple Music 集成** | 通过 MusicKit JS 或 AppleScript 控制 |
| 🟢 P2 | **Spotify 集成** | 通过 Spotify Web API (需用户授权) |
| 🟢 P2 | **本地音乐文件播放** | 导入本地 MP3/FLAC/AAC 文件 |
| 🟢 P2 | **均衡器** | 基于 WebAudio 的 10 段 EQ |
| 🟢 P2 | **情绪节奏音效大师** | 自研音频分析 + 实时音效处理（方案已保存） |
| 🟢 P2 | **多语言支持** | 英文/日文界面 |
| 🟢 P2 | **macOS Shortcuts 集成** | 支持快捷指令控制播放 |

### 7.6 已记录但未实现的方案 (保存在文档中)

以下方案已在项目文档中记录，后续开发时直接读取：

1. **情绪节奏音效大师** → `docs/PROJECT_MEMORY.md:300-304`
2. **壁纸模式/透明玻璃/MyDockFinder 联动** → `docs/WALLPAPER_ENGINE_DESKTOP_FUSION_PLAN.md`
3. **多音乐接口热插拔方案** → `docs/MUSIC_PROVIDER_PLUGIN_PLAN.md`
4. **Ctrl 缩放卡住 Bug 修复计划** → `docs/WORKSPACE_UPDATE_BUG_PLAN.md`

---

## 8. 附录：关键文件清单

### 8.1 需要修改的 macOS 适配文件

| 文件 | 修改优先级 | 涉及内容 |
|------|-----------|---------|
| `desktop/main.js` | 🔴 最高 | 桌面歌词中键、壁纸模式、代码签名配置 |
| `package.json` | 🔴 最高 | hardenedRuntime、gatekeeperAssess、mac 构建配置 |
| `server.js` | 🟡 高 | UA 字符串、更新资产选择逻辑 |
| `build/after-pack.js` | 🟢 中 | macOS 打包后处理 (如添加 entitlements) |
| `public/index.html` | 🟡 高 | 字体渲染、macOS 视觉适配 |

### 8.2 需要新增的文件

| 文件 | 用途 |
|------|------|
| `build/entitlements.mac.plist` | macOS 强化运行时权限 |
| `build/notarize.js` | Apple 公证脚本 |
| `build/dmg-background.png` | DMG 安装背景图 |
| `desktop/macos-media-center.js` | MPNowPlayingInfoCenter 桥接模块 |

### 8.3 参考文档

| 文档 | 内容 |
|------|------|
| `docs/PROJECT_MEMORY.md` | 完整的项目记忆和设计边界 |
| `docs/GLASS_SVG_TEXTURE.md` | 黄金版 SVG 玻璃质感参数 |
| `docs/QQ_MUSIC_INTERFACE_NOTES.md` | QQ音乐接口排障记录 |
| `docs/3D_PLAYLIST_SHELF_MEMORY.md` | 3D 歌单架交互和视觉边界 |
| `docs/DESKTOP_LYRICS_VISUAL.md` | 桌面歌词视觉效果基线 |
| `docs/SECURITY_REBUILD_2026-06-24.md` | 安全重建日志 |

---

> **结论**: Mineradio v1.2.0 的 macOS 移植已完成了基础适配（Electron 配置、Dock 菜单、媒体键），但存在多个**严重的平台专有功能缺失**（桌面歌词锁定、壁纸模式、代码签名）。项目最大的技术债务是 **27k 行单文件 HTML** 和 **4k 行单文件 server.js**。建议按照上述路线图分阶段推进，优先解决 P0 级别的代码签名和桌面歌词问题，使 macOS 版本达到可分发状态。
