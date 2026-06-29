# Mineradio-MacOS

沉浸式桌面音乐播放器，将天气电台、搜索播放、歌词舞台、粒子视觉和 3D 歌单架组合成一个更接近现场感的私人音乐空间。

## 当前版本

`1.3.0`

## 核心特性

- **天气电台** — Open-Meteo 根据位置/城市/天气 mood 生成播放队列
- **多源搜索** — 网易云 + QQ音乐 + Bilibili + Kugou 四源聚合
- **粒子可视化** — 5 种预设 (SILK/TUNNEL/ORBIT/VOID/WALLPAPER) + 骷髅 + 地形三模式
- **3D 歌单架** — 双模式卡片堆叠 (side/stage)，PSP 风格交互
- **舞台歌词** — Three.js 3D 文字平面，跟随粒子运动
- **桌面浮层** — 歌词浮窗 + 壁纸模式，支持全局中键穿透
- **DIY 玩家模式** — 自定义着色器参数、视觉存档导入导出
- **账号体系** — 网易云 + QQ 音乐扫码/Cookie 登录
- **自动更新** — GitHub Releases 检测 + 增量补丁下载
- **手势控制** — MediaPipe 手部追踪，捏合旋转/握拳收束

## 开发运行

```bash
npm install
npm start                  # 开发运行
npm test                   # 100 项单元测试
npm run build:mac          # macOS DMG + ZIP
npm run build:win          # Windows NSIS 安装包
```

桌面版入口由 Electron 主进程加载本地 HTTP 服务，构建产物位于 `dist/`。

## 安装与分发

从 `dist/` 中获取对应平台的安装包：

- **macOS**：打开 `.dmg`，将 Mineradio-MacOS 拖入 Applications 文件夹
- **Windows**：运行 `.exe` 安装程序

> **首次打开提示**：由于应用未经过 Apple 付费开发者签名，macOS 首次打开时会提示"无法验证开发者"。
> 请**右键（或 Control+点击）Mineradio-MacOS → 选择"打开" → 在弹出的对话框中再次点击"打开"**。
> 此操作只需执行一次，之后可正常双击打开。

## 技术架构

```
Electron 33 + Node.js HTTP Server + Three.js r128
├── 后端: raw http.createServer (路由表 46 映射)
├── 前端: 单页 SPA (862 行 HTML + 17,700 行 JS)
├── 模块: beat-analysis / shelf-3d / login / gesture
├── 安全: CORS localhost / CSP / X-Frame-Options
├── GPU: FPS 分级 (60/45/30) / 空闲降帧 / 层级检测
└── 测试: 100 项 (utils / weather / dj-analyzer)
```

## 平台兼容

| 功能 | macOS | Windows | Linux |
|------|-------|---------|-------|
| 核心播放/搜索/可视化 | ✅ | ✅ | ✅ |
| 桌面歌词中键穿透 | ✅ (Swift) | ❌ | ❌ |
| 媒体键 (MPNowPlaying) | ✅ (Swift) | ✅ (globalShortcut) | ✅ |
| 壁纸模式 | ✅ | ✅ (WorkerW) | ❌ |
| DMG/ZIP 打包 | ✅ | — | — |
| NSIS 安装包 | — | ✅ | — |

## 更新机制

Mineradio-MacOS 请求 GitHub Releases latest 检测新版本，支持增量补丁更新和国内镜像加速。

## 第三方音乐平台

本项目不是任何音乐平台的官方客户端。第三方平台接入仅用于个人学习、本地体验和自有账号播放辅助。请遵守对应平台的用户协议与版权规则。

## 用户数据与隐私

登录 Cookie、搜索历史、自定义封面、自定义歌词、节奏分析缓存等仅保存在本机。详见 [PRIVACY.md](./PRIVACY.md)。

## 致谢

原作设计与开源分享：XxHuberrr。macOS 移植与维护：YiIimini。早期体验与测试反馈：emily、小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦。

## 版权与授权

GPL-3.0。详见 [LICENSE](./LICENSE)。
