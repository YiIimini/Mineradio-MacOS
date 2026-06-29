# Mineradio-MacOS v1.3.0 更新说明

v1.3.0 是一次全面的代码质量与性能优化更新。在保留 v1.2.0 全部功能的基础上，对底层架构、安全策略、加载性能、GPU 能耗和代码可维护性进行了系统性改进。

---

## 代码架构

**消除重复，统一入口。** 项目中存在 18 个重复定义的函数（Cookie 处理、版本比较、哈希计算、UA 字符串等），散落在 server.js、utils.js、desktop/main.js 等 5 个文件中。本次更新将这些函数统一收敛到 `server/utils.js`，作为唯一数据源。所有调用方改为导入引用，消除了长期维护中"改了 A 忘了改 B"的隐患。

同时将 `server.js` 中 46 个平铺的 `if/else` 路由分支重构为路由表映射，查找效率从 O(n) 提升至 O(1)，代码结构从一长串条件判断变为清晰的路径-处理器映射。

**前端模块化。** `public/index.html` 此前是一个 25,415 行的单体文件，包含全部 HTML 结构、CSS 和 JavaScript 逻辑。本次更新将其中的 JS 代码提取为独立文件（`public/js/app.js`），并从 app.js 中进一步拆分出四个独立模块：

| 模块 | 行数 | 功能 |
|------|------|------|
| beat-analysis.js | 3,396 | 离线节拍检测、封面深度分析、涟漪触发 |
| shelf-3d.js | 2,323 | 3D 歌单架、内容列表、PSP 风格卡片交互 |
| login.js | 794 | 多平台登录、二维码轮询、Cookie 管理 |
| gesture.js | 400 | MediaPipe 手势追踪、捏合旋转、握拳收束 |

HTML 文件从 25,415 行缩减至 862 行，缩减 97%。

---

## 安全加固

**CORS 策略收紧。** 此前所有 API 响应均设置 `Access-Control-Allow-Origin: *`，允许任意来源访问本地服务。现改为仅允许 `localhost` 和 `127.0.0.1` 来源，并添加 CORS 预检（OPTIONS）处理。

**内容安全策略。** HTML 响应新增 Content-Security-Policy 头，限制脚本、样式、媒体等资源的加载来源。同时添加 `X-Content-Type-Options: nosniff` 和 `X-Frame-Options: DENY` 头，防止 MIME 嗅探和点击劫持。

**错误边界。** 新增全局 `window.onerror` 和 `unhandledrejection` 事件捕获，避免渲染进程静默崩溃，所有异常均有日志输出。

---

## 加载性能

**脚本异步加载。** vendor 脚本（Three.js 600KB、GSAP、music-tempo）和应用代码全部改为 `defer` 加载。浏览器在解析 HTML 的同时并行下载所有 JS 文件，DOMContentLoaded 后按序执行。首屏渲染不再被大型脚本阻塞。

**资源预加载。** 添加 `preconnect`（Google Fonts）和 `preload`（Three.js、GSAP）提示，提前建立连接和下载关键资源。

**离线缓存。** 引入 Service Worker，缓存静态资源（HTML/CSS/JS/vendor），非首次访问可实现毫秒级加载。

---

## GPU 能耗优化

**帧率分级管理。** 此前所有 FPS 限制常量均设为 0（不限制），在 120Hz ProMotion 屏幕上 GPU 以满刷新率运行。现已激活分级策略：

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 普通播放 | 120fps | 60fps |
| 大窗口/高分屏 | 120fps | 45fps |
| 4K/超宽屏 | 120fps | 30fps |
| 空闲 4 秒后 | 120fps | 30fps |
| 壁纸模式 | 120fps | 30fps |

用户在交互（拖拽、点击、滚动）时自动恢复至显示器刷新率，手感无损。

**GPU 层级检测。** 首次启动时检测 GPU 型号。低端集成显卡（Intel HD、Mali、PowerVR 等）自动切换至 `eco` 品质模式，进一步降低渲染负载。

**WebGL 上下文恢复。** 添加 `webglcontextlost` / `webglcontextrestored` 事件处理。系统休眠唤醒后自动重编译着色器，防止花屏。

---

## 测试覆盖

从零建立了测试体系，使用 Node.js 内置 `node:test` 模块，无需额外依赖：

| 测试文件 | 覆盖 |
|----------|------|
| utils.test.js | MIME 映射、版本比较/规范化、SHA 哈希、Cookie 解析/序列化、JSON 解析、数字夹取、UA 生成等 22 个函数 |
| weather.test.js | 15 种天气代码映射、14 种 mood 场景（晴/雨/雷/雪/闷/阴/夜/晨/昏/强风/寒冷/属性范围/keywords） |
| dj-analyzer.test.js | 数值夹取、百分位/中位数、双二阶滤波器频率响应、节拍图生成 |

运行 `npm test`，100 项全部通过。

---

## Bug 修复

- 修正 `ensureBeatMapCacheDir` 双重 `mkdirSync` 调用
- 为空 catch 块添加错误日志（Cookie 持久化、URL 解析、登出等关键路径）
- 音频/封面代理流添加背压处理，防止大文件内存积压

---

## 其他改进

- **壁纸优化**：壁纸渲染循环添加 30fps 上限，减少静态壁纸模式的 GPU 空转
- **导航索引**：app.js 顶部添加完整模块行号索引，快速定位任意功能区
- **品牌更新**：原作者 XxHuberrr，macOS 移植与维护 YiIimini，产品名 Mineradio-MacOS

---

## 版本信息

- **版本**：v1.3.0
- **日期**：2026-06-30
- **授权**：GPL-3.0
- **测试**：`npm test` — 100/100 pass
- **发布**：https://github.com/YiIimini/Mineradio-MacOS/releases/tag/v1.3.0
