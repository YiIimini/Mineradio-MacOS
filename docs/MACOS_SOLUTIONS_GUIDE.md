# Mineradio macOS 优化与修复 — 解决方案文档

> 配套分析报告：`docs/MACOS_DEEP_ANALYSIS_REPORT.md`
> 版本：v1.2.0
> 日期：2026-06-29

---

## 目录

1. [P0 紧急修复方案](#1-p0-紧急修复方案)
2. [P1 重要优化方案](#2-p1-重要优化方案)
3. [P2/P3 改进方案](#3-p2p3-改进方案)
4. [代码架构重构方案](#4-代码架构重构方案)
5. [macOS 原生功能实现方案](#5-macos-原生功能实现方案)
6. [测试与验证计划](#6-测试与验证计划)

---

## 1. P0 紧急修复方案

### 1.1 macOS 桌面歌词中键锁定/解锁

**问题**: `startDesktopLyricsMousePoller()` 使用 PowerShell + `GetAsyncKeyState(4)`，在 macOS 上完全跳过。

**解决方案 — macOS CGEvent 方案**：

在 `desktop/main.js` 中新增 macOS 专有的全局鼠标事件监听：

```js
// desktop/main.js - 新增 macOS 中键监听
function startDesktopLyricsMousePoller() {
  if (desktopLyricsMousePoller) return;

  if (process.platform === 'darwin') {
    startMacOSDesktopLyricsMousePoller();
    return;
  }

  if (process.platform !== 'win32') return;
  // ... 保留原有 Windows PowerShell 实现 ...
}

function startMacOSDesktopLyricsMousePoller() {
  // 方案 A: 使用 CGEvent 监听全局鼠标事件
  // 通过 Node.js child_process 运行一个小的 Swift helper
  const helperPath = path.join(__dirname, 'macos-lyrics-helper');
  // 编译: swiftc macos-lyrics-helper.swift -o macos-lyrics-helper

  try {
    desktopLyricsMousePoller = spawn(helperPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    desktopLyricsMousePoller.stdout.on('data', (chunk) => {
      desktopLyricsMousePollerBuffer += chunk.toString('utf8');
      const lines = desktopLyricsMousePollerBuffer.split(/\r?\n/);
      desktopLyricsMousePollerBuffer = lines.pop() || '';
      lines.forEach((line) => {
        if (line.trim() === 'MMB') handleDesktopLyricsGlobalMiddleClick();
      });
    });

    desktopLyricsMousePoller.on('exit', () => {
      desktopLyricsMousePoller = null;
      desktopLyricsMousePollerBuffer = '';
    });

    desktopLyricsMousePoller.on('error', () => {
      desktopLyricsMousePoller = null;
      desktopLyricsMousePollerBuffer = '';
    });
  } catch (e) {
    console.warn('[DesktopLyrics] macOS mouse poller failed:', e.message);
    desktopLyricsMousePoller = null;
  }
}
```

**方案 B — 备选：本地 WebSocket 中继**：

在 `desktop/main.js` 中通过 `CGEvent` 的 NAPI 原生模块或使用 `iohook` 库（如果 macOS 兼容）来监听全局鼠标事件。

**推荐**: 方案 A — Swift helper 方案，因为：
- 不需要额外 npm 依赖（`iohook` 在 Electron 33 上不稳定）
- Swift 脚本使用 macOS 原生 Accessibility API，权限可控
- 仅 ~30 行 Swift 代码

**配套 Swift helper 文件** (`desktop/macos-lyrics-helper.swift`):

```swift
import CoreGraphics
import Foundation

// 监控全局鼠标中键按下事件
let mask = CGEventMask(1 << CGEventType.otherMouseDown.rawValue)
let queue = DispatchQueue(label: "com.mineradio.lyrics-mouse")

let callback: CGEventTapCallBack = { (proxy, type, event, refcon) in
    if type == .otherMouseDown {
        let button = event.getIntegerValueField(.mouseEventButtonNumber)
        if button == 2 { // 中键
            print("MMB")
            fflush(stdout)
        }
    }
    return Unmanaged.passRetained(event)
}

if let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly,
    eventsOfInterest: mask,
    callback: callback,
    userInfo: nil
) {
    let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    CFRunLoopRun()
} else {
    // 回退：退出并让 Electron 侧检测到 helper 不可用
    print("ACCESSIBILITY_DENIED")
    fflush(stdout)
    exit(1)
}
```

**注意事项**:
- 用户需要在「系统设置 → 隐私与安全性 → 辅助功能」中授权 Mineradio
- helper 退出时 Electron 侧自动降级，不影响其他功能

---

### 1.2 macOS 代码签名与公证

**当前状态**: `hardenedRuntime: false, gatekeeperAssess: false`

**解决方案**:

#### Step 1: 获取 Apple Developer 证书

```bash
# 1. 注册 Apple Developer Program (https://developer.apple.com)
# 2. 在 Xcode → Settings → Accounts → Manage Certificates
#    创建 "Developer ID Application" 证书
# 3. 导出证书为 .p12 文件供 CI 使用
```

#### Step 2: 更新 package.json

```json
{
  "build": {
    "mac": {
      "icon": "build/icon.icns",
      "category": "public.app-category.music",
      "target": [
        { "target": "dmg", "arch": ["arm64", "x64"] },
        { "target": "zip", "arch": ["arm64", "x64"] }
      ],
      "artifactName": "Mineradio-${version}-mac-${arch}.${ext}",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "provisioningProfile": "build/Mineradio.provisionprofile"
    },
    "afterSign": "build/notarize.js"
  }
}
```

#### Step 3: 创建 entitlements 文件

**`build/entitlements.mac.plist`**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>com.apple.security.device.camera</key>
    <false/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.files.downloads.read-write</key>
    <true/>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
</dict>
</plist>
```

#### Step 4: 创建公证脚本

**`build/notarize.js`**:

```js
const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`  • notarizing ${appPath}`);

  try {
    await notarize({
      tool: 'notarytool',
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });
    console.log('  • notarization complete');
  } catch (error) {
    console.error('  ✗ notarization failed:', error.message);
    throw error;
  }
};
```

#### Step 5: 环境变量配置

在开发环境或 CI 中设置：

```bash
export APPLE_ID="your-apple-id@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

#### Step 6: 安装 @electron/notarize

```bash
npm install --save-dev @electron/notarize
```

---

### 1.3 修复自动更新资产选择

**问题**: `server.js:369-371` 优先选择 `.exe` 文件。

**解决方案**:

修改 `server.js` 的 `pickReleaseAsset` 函数：

```js
// server.js - pickReleaseAsset 修改
function pickReleaseAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const platform = process.platform; // 'darwin' | 'win32' | 'linux'

  // macOS 优先 .dmg，其次 .zip
  if (platform === 'darwin') {
    const dmg = list.find(a => /\.dmg$/i.test(a && a.name || ''));
    const zip = list.find(a => /\.zip$/i.test(a && a.name || ''));
    if (dmg) return buildAssetInfo(dmg);
    if (zip) return buildAssetInfo(zip);
  }

  // Windows 优先 .exe，其次 .zip
  if (platform === 'win32') {
    const exe = list.find(a => /\.(exe|msi)$/i.test(a && a.name || ''));
    const zip = list.find(a => /\.zip$/i.test(a && a.name || ''));
    if (exe) return buildAssetInfo(exe);
    if (zip) return buildAssetInfo(zip);
  }

  // 兜底：取第一个匹配的
  const fallback = list.find(a => /\.(dmg|exe|zip|AppImage|deb)$/i.test(a && a.name || ''))
    || list[0];
  return fallback ? buildAssetInfo(fallback) : null;

  function buildAssetInfo(asset) {
    const digest = assetDigestInfo(asset);
    const candidates = uniqueDownloadCandidates(asset.browser_download_url || '');
    return {
      name: asset.name || '',
      size: asset.size || 0,
      contentType: asset.content_type || '',
      downloadUrl: asset.browser_download_url || '',
      downloadUrls: publicDownloadUrls(candidates),
      sha256: digest.sha256 || '',
      sha512: digest.sha512 || '',
    };
  }
}
```

另外修改 `updateAssetNameFromUrl` 附近的逻辑，确保 `safeUpdateFileName` 在 macOS 上默认用 `.dmg`：

```js
function safeUpdateFileName(name, version) {
  const raw = String(name || '').trim();
  const ext = process.platform === 'darwin' ? '.dmg' : '.exe';
  const fallback = `Mineradio-${version || APP_VERSION}${ext}`;
  // ... 其余逻辑 ...
}
```

---

### 1.4 修复 Ctrl +/- 缩放卡住

**问题**: Chromium `per_host_zoom_levels` 残留负值。

**解决方案**:

在 `desktop/main.js` 中添加启动时清理逻辑和键盘快捷键拦截：

```js
// desktop/main.js - createWindow() 中 mainWindow 创建后添加

// 清除异常的 zoom level 残留
mainWindow.webContents.once('did-finish-load', () => {
  // 读取并修复 zoom level
  mainWindow.webContents.executeJavaScript(`
    (function() {
      try {
        var key = 'mineradio-zoom-fixed-v1';
        if (localStorage.getItem(key)) return;
        // 重置 zoom level 到 0
        if (typeof desktopWindow !== 'undefined') {
          // 通过 Electron API 重置
        }
        // 强制浏览器 zoom 归零
        document.body.style.zoom = '';
        localStorage.setItem(key, '1');
      } catch(e) {}
    })();
  `).catch(() => {});
});

// 拦截缩放快捷键，保持正常范围
mainWindow.webContents.on('before-input-event', (event, input) => {
  if (input.type === 'keyDown' && (input.control || input.meta)) {
    const key = input.key;
    // Ctrl+0 重置缩放
    if (key === '0') {
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(0);
      return;
    }
    // Ctrl+= 或 Ctrl++ 放大（限制最大值）
    if (key === '=' || key === '+' || key === 'NumpadAdd') {
      event.preventDefault();
      const current = mainWindow.webContents.getZoomLevel();
      if (current < 2.0) {
        mainWindow.webContents.setZoomLevel(Math.min(2.0, current + 0.5));
      }
      return;
    }
    // Ctrl+- 缩小（限制最小值）
    if (key === '-' || key === 'NumpadSubtract') {
      event.preventDefault();
      const current = mainWindow.webContents.getZoomLevel();
      if (current > -1.0) {
        mainWindow.webContents.setZoomLevel(Math.max(-1.0, current - 0.5));
      }
      return;
    }
  }
});
```

同时在启动时清除 Chromium Preferences 中的异常 zoom 记录：

```js
// desktop/main.js - 在 app.whenReady() 中添加
if (process.platform === 'darwin') {
  const prefsPath = path.join(app.getPath('userData'), 'Preferences');
  try {
    if (fs.existsSync(prefsPath)) {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      if (prefs.partition && prefs.partition.per_host_zoom_levels) {
        delete prefs.partition.per_host_zoom_levels;
        fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
      }
    }
  } catch (e) {
    console.warn('Zoom level cleanup skipped:', e.message);
  }
}
```

---

## 2. P1 重要优化方案

### 2.1 macOS 壁纸模式替代方案

**问题**: WorkerW 是 Windows 专有概念，macOS 无等价物。

**解决方案 — NSWindow Level 方案**:

```js
// desktop/main.js - 修改 createWallpaperWindow

function createWallpaperWindow(payload = {}) {
  wallpaperState = { ...wallpaperState, ...payload, enabled: true };

  if (process.platform === 'darwin') {
    return createMacOSWallpaperWindow(payload);
  }

  // ... 保留原有 Windows 实现 ...
}

function createMacOSWallpaperWindow(payload = {}) {
  if (wallpaperWindow && !wallpaperWindow.isDestroyed()) {
    positionMacOSWallpaperWindow();
    sendWallpaperState();
    return wallpaperWindow;
  }

  const bounds = screen.getPrimaryDisplay().bounds;

  wallpaperWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    type: 'desktop',  // macOS: 尝试使用 desktop window level
    title: 'Mineradio Wallpaper',
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  // macOS: 设置窗口层级为桌面层级
  wallpaperWindow.setAlwaysOnTop(true, 'screen-saver');
  wallpaperWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  wallpaperWindow.setIgnoreMouseEvents(true, { forward: true });

  // macOS: 尝试设置 NSWindow level 到桌面壁纸层
  if (process.platform === 'darwin') {
    try {
      const { BrowserWindow: BW } = require('electron');
      // 通过 internal API 设置 window level
      // kCGDesktopWindowLevel = -2147483623
      wallpaperWindow.setAlwaysOnTop(true, 'screen-saver');
    } catch (e) {
      console.warn('macOS wallpaper level setup failed:', e.message);
    }
  }

  wallpaperWindow.once('ready-to-show', () => {
    if (!wallpaperWindow || wallpaperWindow.isDestroyed()) return;
    positionMacOSWallpaperWindow();
    wallpaperWindow.showInactive();
    sendWallpaperState();
  });

  wallpaperWindow.webContents.once('did-finish-load', sendWallpaperState);
  wallpaperWindow.on('closed', () => { wallpaperWindow = null; });
  wallpaperWindow.loadURL(overlayUrl('wallpaper.html'))
    .catch((e) => console.warn('Wallpaper load failed:', e.message));

  return wallpaperWindow;
}
```

**更优方案**：使用 Swift 原生代码操作 `NSWindow` 的 level 属性，将窗口设为 `kCGDesktopWindowLevel`。这需要编写一个小的原生 addon 或使用 `@electron/remote`。

**建议**: 第一阶段先做"透明玻璃模式"（参考 `docs/WALLPAPER_ENGINE_DESKTOP_FUSION_PLAN.md`），将主窗口设为透明 + 鼠标穿透 + 控制台浮层。此方案跨平台兼容性最好。

---

### 2.2 macOS 桌面歌词全工作区可见

**解决方案**:

```js
// desktop/main.js - createDesktopLyricsWindow 修改

function createDesktopLyricsWindow(payload = {}) {
  // ... 创建窗口逻辑 ...

  desktopLyricsWindow = new BrowserWindow({
    // ... 现有配置 ...
  });

  try {
    desktopLyricsWindow.setAlwaysOnTop(true, 'screen-saver');

    // macOS: 在所有工作区(Spaces)可见
    if (process.platform === 'darwin') {
      desktopLyricsWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      });
    } else {
      desktopLyricsWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      });
    }
  } catch (e) {
    console.warn('Desktop lyrics topmost setup skipped:', e.message);
  }

  // ... 其余逻辑 ...
}
```

**注意**: macOS 上的 `setVisibleOnAllWorkspaces` 在 Electron 33 中应该可用，移除原来的 `if (process.platform !== 'darwin')` 条件。

---

### 2.3 macOS 字体渲染优化

**问题**: 同样的 CSS 在 macOS 和 Windows 上渲染差异大。

**解决方案**:

在 `public/index.html` 中添加 macOS 专用的字体调整：

```css
/* macOS 字体渲染微调 */
@media screen and (-webkit-min-device-pixel-ratio: 2) {
  /* macOS Retina 屏幕 */
  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    /* macOS 文字略微加粗以匹配 Windows 渲染 */
    text-rendering: optimizeLegibility;
  }
}

/* 中文字体回退优化 */
:root {
  --font-sans-macos: "PingFang SC", "PingFang HK", "Noto Sans SC",
    -apple-system, BlinkMacSystemFont, "Helvetica Neue",
    "Inter", system-ui, sans-serif;
  /* 不使用 HarmonyOS Sans SC 和 Alibaba PuHuiTi，
     这些在 macOS 上通常不可用 */
}

/* macOS 上使用系统字体 */
@supports (-webkit-backdrop-filter: blur(10px)) {
  body {
    font-family: var(--font-sans-macos);
  }
}
```

---

### 2.4 UA 字符串平台感知

**解决方案**:

```js
// server.js - 修改 UA 字符串

function getPlatformUA() {
  if (process.platform === 'darwin') {
    return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

const UA = getPlatformUA();
```

同时修改 `bilibili-api.js` 和 `kugou-api.js` 中的硬编码 UA：

```js
// bilibili-api.js
const UA = process.platform === 'darwin'
  ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
```

---

### 2.5 macOS 媒体键完善

**当前已实现**: MediaPlayPause, MediaPreviousTrack, MediaNextTrack

**需要补充**:

```js
// desktop/main.js - 在 media key registration 后添加

if (process.platform === 'darwin') {
  // 额外注册 macOS 常用媒体键变体
  const extraMediaKeys = [
    { accelerator: 'Cmd+Right', action: 'nextTrack' },
    { accelerator: 'Cmd+Left', action: 'prevTrack' },
    { accelerator: 'Space', action: 'togglePlay',
      // 注意：Space 可能与输入框冲突，需要加条件
    },
  ];
  // 在 before-input-event 中处理，而非 globalShortcut
}
```

---

## 3. P2/P3 改进方案

### 3.1 播放/暂停按钮偶发失效修复

**根因**: `togglePlay()` 在异步操作中可能失去浏览器用户激活上下文。

**解决方案**:

```js
// public/index.html - togglePlay 增强

function togglePlay() {
  // 保存用户交互上下文
  const userGesture = new Promise((resolve) => {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().then(resolve).catch(resolve);
    } else {
      resolve();
    }
  });

  userGesture.then(() => {
    if (playing) {
      audio.pause();
      // 不要立即设为 !playing，等 pause 事件确认
    } else {
      // 先调用 play()，利用用户手势
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Auto-play prevented:', err.message);
          // 不改变 UI 状态，提示用户手动点击
        });
      }
    }
  });
}
```

### 3.2 搜索栏 SVG 玻璃在亮底/黑底一致性

在生成 displacement map 时增加亮度自适应：

```js
// public/index.html - generateControlGlassDisplacementMap 增强

function generateControlGlassDisplacementMap(width, height, radius) {
  // 检测当前背景明暗
  const isDarkBackground = getComputedStyle(document.body)
    .getPropertyValue('--custom-bg-color').trim() === '#000';

  // 暗底：红色偏移 180，亮底：降低偏移到 120
  const redScale = isDarkBackground ? 180 : 120;
  const greenScale = isDarkBackground ? 170 : 110;
  const blueScale = isDarkBackground ? 160 : 100;
  // ...
}
```

### 3.3 单文件巨石拆分 (过渡方案)

在完全重构前，先将关键模块提取为独立文件：

**Phase 1 — 提取 CSS**:
```
public/
├── index.html          # 精简后 ~5000 行 HTML + JS
├── css/
│   ├── main.css        # 通用样式
│   ├── desktop.css     # 桌面 Shell 样式
│   ├── splash.css      # 启动页样式
│   ├── search.css      # 搜索栏样式
│   ├── player.css      # 播放器控制台样式
│   ├── visual.css      # 视觉控制台样式
│   ├── shelf.css       # 3D 歌单架样式
│   ├── lyrics.css      # 歌词样式
│   └── keyframes.css   # 动画关键帧
```

**Phase 2 — 提取 JS 模块**:
```
public/
├── js/
│   ├── app.js          # 主入口，初始化
│   ├── player.js       # 播放控制
│   ├── search.js       # 搜索逻辑
│   ├── visual.js       # Three.js 3D 场景
│   ├── shelf.js        # 3D 歌单架
│   ├── lyrics.js       # 歌词系统
│   ├── home.js         # Home 页
│   ├── weather.js      # 天气电台
│   ├── presets.js      # 视觉预设定义
│   ├── archive.js      # 用户存档
│   ├── desktop.js      # 桌面 Shell 逻辑
│   └── fx-controller.js # 视觉控制台
```

**实施步骤**:
1. 将 `<style>` 块提取到独立 CSS 文件，`<link>` 引入
2. 将 `<script>` 中的全局变量/函数封装为 IIFE 模块
3. 用 `<script src="js/xxx.js">` 按依赖顺序加载
4. 后续再引入构建工具 (Vite) 做真正模块化

---

## 4. 代码架构重构方案

### 4.1 服务端拆分

当前 `server.js` (4191行) → 拆分为：

```
server/
├── index.js              # 服务入口，路由注册 (~200行)
├── routes/
│   ├── search.js         # 搜索相关 API
│   ├── playback.js       # 播放/URL 相关 API
│   ├── login.js          # 登录/登出/状态 API
│   ├── podcast.js        # 播客相关 API
│   ├── playlist.js       # 歌单相关 API
│   ├── update.js         # 更新检查/下载 API
│   ├── weather.js        # 天气电台 API
│   └── beatmap.js        # 节拍缓存 API
├── services/
│   ├── netease.js        # 网易云接口封装
│   ├── qqmusic.js        # QQ音乐接口封装
│   ├── update-checker.js # 更新检查逻辑
│   └── weather.js        # 天气数据处理
├── utils/
│   ├── cookie.js         # Cookie 处理
│   ├── crypto.js         # 加密/哈希
│   ├── http.js           # HTTP 请求工具
│   ├── quality.js        # 音质探测
│   └── version.js        # 版本比较
└── middleware/
    ├── cors.js
    └── auth.js
```

### 4.2 Three.js 升级路径

```
当前: Three.js r128 (2021) — 全局脚本 <script src="vendor/three.r128.min.js">
目标: Three.js r170+ (2025-2026) — ES module

步骤:
1. npm install three@latest
2. 将 <script src="vendor/three.r128.min.js"> 替换为:
   import * as THREE from 'three';
3. 适配 API 变化:
   - r128 → r170 主要变化在 WebGLRenderer 和 Material API
   - Geometry → BufferGeometry (r128 已支持，需确认)
   - renderer.outputEncoding → renderer.outputColorSpace (r152+)
4. 测试所有 3D 场景和粒子系统
```

### 4.3 TypeScript 渐进式引入

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "checkJs": false,
    "strict": false,
    "outDir": "./dist",
    "rootDir": "./"
  },
  "include": ["desktop/**/*.js", "server/**/*.js"],
  "exclude": ["node_modules", "dist", "public/vendor"]
}
```

建议从 `server/` 开始，因为服务端逻辑更容易类型化。

---

## 5. macOS 原生功能实现方案

### 5.1 MPNowPlayingInfoCenter 集成

**目的**: 在 macOS 控制中心/锁屏界面显示当前播放歌曲。

使用 Electron 的 `systemPreferences` 或原生模块：

```js
// desktop/macos-nowplaying.js (需要在 main 进程中运行)
// 方案：使用 N-API 原生模块桥接 MPNowPlayingInfoCenter

// 备选方案：使用 AppleScript
const { execFile } = require('child_process');

function updateNowPlaying(info) {
  if (process.platform !== 'darwin') return;

  const script = `
    tell application "System Events"
      -- 通过 Music app 间接更新 Now Playing (hack)
    end tell
  `;

  // 更好的方案是使用原生模块或 MPRIS bridge
}
```

**推荐方案**: 使用 `@julusian/node-mac-media-controls` 或编写一个轻量的 Swift helper 通过 stdin/stdout 与 Electron 主进程通信。

### 5.2 菜单栏应用模式

```js
// desktop/main.js - 添加菜单栏模式

let tray = null;

function createTray() {
  if (process.platform !== 'darwin') return;

  const { Tray, Menu, nativeImage } = require('electron');
  const iconPath = path.join(__dirname, '..', 'build', 'icon-tray.png');

  tray = new Tray(nativeImage.createFromPath(iconPath));
  const contextMenu = Menu.buildFromTemplate([
    { label: '播放/暂停', click: () => sendGlobalHotkeyAction('togglePlay') },
    { label: '下一首', click: () => sendGlobalHotkeyAction('nextTrack') },
    { label: '上一首', click: () => sendGlobalHotkeyAction('prevTrack') },
    { type: 'separator' },
    { label: '显示 Mineradio', click: () => focusMainWindow() },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } },
  ]);

  tray.setToolTip('Mineradio');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => focusMainWindow());
}

// 在 app.whenReady() 中调用 createTray()
```

### 5.3 Touch Bar 支持

```js
// desktop/main.js - Touch Bar

if (process.platform === 'darwin') {
  const { TouchBar } = require('electron');
  const { TouchBarButton, TouchBarSpacer } = TouchBar;

  const touchBar = new TouchBar({
    items: [
      new TouchBarButton({
        label: '⏮',
        click: () => sendGlobalHotkeyAction('prevTrack'),
      }),
      new TouchBarButton({
        label: '▶',
        click: () => sendGlobalHotkeyAction('togglePlay'),
      }),
      new TouchBarButton({
        label: '⏭',
        click: () => sendGlobalHotkeyAction('nextTrack'),
      }),
      new TouchBarSpacer({ size: 'flexible' }),
      new TouchBarButton({
        label: '🎙',
        click: () => sendGlobalHotkeyAction('toggleLyrics'),
      }),
    ],
  });

  mainWindow.setTouchBar(touchBar);
}
```

---

## 6. 测试与验证计划

### 6.1 macOS 功能测试清单

| # | 测试项 | 验证方法 |
|---|--------|---------|
| 1 | 应用启动 | 双击 .app，确认无 Gatekeeper 阻止 |
| 2 | 网易云登录 | 扫码/手机号登录，确认 cookie 持久化 |
| 3 | QQ音乐登录 | 扫码登录，确认播放授权完整 |
| 4 | 歌曲搜索 | 多关键词搜索，确认多源返回 |
| 5 | 歌曲播放 | 点击播放，确认音频输出正常 |
| 6 | 歌词显示 | 播放时确认歌词滚动和舞台歌词 |
| 7 | 3D 粒子可视化 | 切换视觉预设，确认渲染流畅 |
| 8 | 3D 歌单架 | 右键打开，确认交互正常 |
| 9 | 天气电台 | 定位城市，确认电台生成 |
| 10 | 桌面歌词 | 开启/关闭，确认浮动窗口 |
| 11 | 中键锁定 | macOS 新方案，确认中键切换穿透 |
| 12 | 壁纸模式 | macOS 新方案，确认桌面层级 |
| 13 | Dock 菜单 | 右键 Dock 图标，确认菜单项可用 |
| 14 | 媒体键 | F7/F8/F9 和耳机线控 |
| 15 | Touch Bar | 确认播放控制按钮 |
| 16 | 自动更新 | 检查更新 → 下载 DMG → 手动安装 |
| 17 | 最小化/恢复 | 窗口最小化后恢复，确认音频不中断 |
| 18 | 全屏 (Space) | 进入全屏空间，确认 UI 正常 |
| 19 | 多桌面切换 | 在不同 Space 间切换，确认窗口跟随 |
| 20 | 睡眠/唤醒 | 合盖后打开，确认自动暂停和恢复 |

### 6.2 性能测试基准

| 指标 | 目标值 | 测量工具 |
|------|--------|---------|
| 启动时间 | < 3 秒 (冷启动) | 手动计时 |
| 空闲内存 | < 350 MB | 活动监视器 |
| 播放内存 | < 500 MB | 活动监视器 |
| CPU 空闲 | < 5% | 活动监视器 |
| CPU 播放+3D | < 35% | 活动监视器 |
| GPU 占用 | < 40% (集成显卡) | 活动监视器 → 窗口 → GPU 历史 |
| 能耗影响 | "低" 或 "中" | 活动监视器 → 能耗 |
| 帧率 (3D) | ≥ 45 FPS | requestAnimationFrame 计数 |

### 6.3 构建验证

```bash
# macOS 构建
npm run build:mac:dir     # 快速验证，不打包 DMG
npm run build:mac         # 完整 DMG + ZIP

# 验证构建产物
ls -la dist/mac-arm64/Mineradio.app/Contents/MacOS/Mineradio
codesign -dvvv dist/mac-arm64/Mineradio.app  # 检查签名
spctl -a -v dist/mac-arm64/Mineradio.app     # 检查 Gatekeeper

# 验证 DMG
hdiutil attach dist/Mineradio-*.dmg
# 检查 DMG 内容
hdiutil detach /Volumes/Mineradio-*
```

---

## 总结：建议执行顺序

```
第 1 周:
  ✅ 1. 修复 Ctrl+/- 缩放卡住 (P0, 改动最小)
  ✅ 2. 修复 UA 字符串平台感知 (P1)
  ✅ 3. 修复桌面歌词全工作区可见 (P1)

第 2 周:
  ✅ 4. 修复更新资产选择 (P0)
  ✅ 5. 实现 macOS 中键锁定 (P0, Swift helper)
  ✅ 6. macOS 字体渲染优化 (P1)

第 3 周:
  ✅ 7. Apple Developer 证书 + 代码签名 (P0, 需花钱)
  ✅ 8. entitlements 配置文件 (P0)
  ✅ 9. 公证脚本 (P0)

第 4-6 周:
  ✅ 10. macOS 壁纸模式替代方案 (P1)
  ✅ 11. MPNowPlayingInfoCenter (P1)
  ✅ 12. 菜单栏应用模式 (P2)
  ✅ 13. Touch Bar (P2)

第 7-12 周:
  ✅ 14. 代码架构重构 (P1-P2)
  ✅ 15. Three.js 升级
  ✅ 16. 测试与修复
```

> **关键提醒**: 所有代码修改前请先阅读 `docs/PROJECT_MEMORY.md` 和对应的专项文档，避免回退已修复的边界。修改后务必实机验证。
