# 🔥 Mineradio-MacOS GPU 深度优化方案

> 诊断日期：2026-06-30 | 版本：v1.3.2 | 目标：降低 GPU 占用率 50%+

---

## 项目诊断摘要

| 指标 | 数值 |
|---|---|
| **核心技术** | Electron 33 + Three.js r128 (WebGL 1.0) |
| **主粒子数** | ~30,000 封面粒子（双通道渲染） |
| **地形柱体** | 12,544 InstancedMesh 立方体 (112×112 grid) |
| **泡沫平面** | 224×224 = 50,176 顶点 ShaderMaterial |
| **不规则平面** | 112×112 ShaderMaterial |
| **浮空粒子** | 1,300 个 |
| **背景封面粒子** | 3,000 个 |
| **总绘图像素数** | ~5.2M (retina 屏，dprCap=1.35) |
| **WebGL 上下文** | 最多 3 个同时存在（主窗口 + 桌面歌词 + 壁纸） |

---

## 🎯 根因分析：GPU 占用高的 7 大瓶颈

### 1. 每帧 CPU 端更新 12,544 个 instanced mesh 矩阵（最严重）

```
mineradio-terrain.js:205-274  — for (var i = 0; i < PILLAR_COUNT; i++)
```

每帧在 **JS 主线程** 上：
- 遍历全部 12,544 个柱体
- 计算音频驱动的 elevation（多层加权、三角函数）
- 做颜色混合（`new THREE.Color().lerp()` × 12,544 次 → **每帧 GC 12,544 个临时对象**）
- 更新实例矩阵 + 实例颜色 buffer → 上传到 GPU

**影响**：JS 主线程每帧耗时 3-8ms，直接挤压渲染预算。更重要的是，12,544 个 `new THREE.Color()` 每帧触发大量 GC。

### 2. 泡沫平面 (Foam) 片段着色器过于复杂

```
mineradio-terrain.js:316-339  — foamFragShader
```

224×224 = 50,176 个顶点，每个像素执行：
- `smoothstep` × 4
- `mix` × 4
- `random` 函数调用
- `sin/cos` 计算

在 2880×1800 的 retina 屏幕上，这个着色器覆盖大部分屏幕 → **上千万次片段着色器执行**。

### 3. 粒子双通道渲染 (Normal + Additive Bloom)

```
app.js:3806-3813  — bloomParticles + particles 两个 Points 对象
```

~30,000 个粒子被渲染 **两次**：
- `bloomParticles`：AdditiveBlending, renderOrder=0
- `particles`：NormalBlending, renderOrder=1

每次都是完整的 vertex + fragment shader 通道。

### 4. `frustumCulled = false` 禁用了视锥剔除

```
terrain.js:573   — pillarInstanced.frustumCulled = false
app.js:3807      — bloomParticles.frustumCulled = false
app.js:3811      — particles.frustumCulled = false
```

所有柱体和粒子无论是否在屏幕内都被提交到 GPU。

### 5. Phong 着色 + 4 个光源照亮 12,544 个实例

```
terrain.js:539-552  — AmbientLight + 3× DirectionalLight + PointLight
```

MeshPhongMaterial 配合多个光源，GPU 必须为每个可见实例计算光照。

### 6. 壁纸窗口独立渲染循环

```
wallpaper.html:84-140  — Canvas 2D, 30fps, 420-760 粒子
```

即使主窗口在前台，壁纸窗口也在后台持续渲染。

### 7. Chromium flags 将更多工作推给 GPU

```
desktop/main.js:53-57
'ignore-gpu-blocklist'        → 即使 GPU 不支持也强制硬件加速
'enable-gpu-rasterization'    → 光栅化全走 GPU
'enable-zero-copy'            → 零拷贝纹理上传
'enable-accelerated-2d-canvas' → Canvas 2D 也走 GPU
```

---

## 🛠 优化方案

### 🔴 Tier 1 — 立即见效（已完成 ✅）

- [x] **1.1 柱体颜色计算去对象化** — 复用临时 Color 对象，消除每帧 12,544 次 GC
- [x] **1.2 启用 frustum culling** — 柱体和粒子启用视锥剔除
- [x] **1.3 降低泡沫平面网格密度** — FOAM_GRID 224→128，顶点 50,176→16,384
- [x] **1.4 优化 Chromium GPU flags** — 移除强制 GPU 加速的 flags

### 🟡 Tier 2 — 显著改善（已完成 ✅）

- [x] **2.1 柱体权重预计算** — 将 per-pillar 的 subW/bassW/lowMidW/midW/highMidW/energyW 预计算到 pillarData，JS 循环从 15+ 次 sin/cos/max/abs 简化为纯乘加
- [x] **2.2 粒子双通道合并** — 移除 bloomParticles (30K 粒子独立 draw call)，bloom 效果合并到主 fragment shader 的 self-bloom 计算
- [x] **2.3 壁纸智能暂停** — 主窗口全屏/最大化时暂停 wallpaper canvas 渲染循环
- [x] **2.4 不规则平面网格降低** — IRREG_GRID 112→80 (顶点 -49%)

### 🟢 Tier 3 — 架构级改进（已完成 ✅）

- [x] **3.1 质量档位绑定柱体密度** — GRID: eco=56², balanced=80², high=96², ultra=112²（重启生效）
- [x] **3.2 地形跳帧更新** — 柱体实例按质量跳帧: ultra/high 每帧, balanced 隔帧, eco 每 3 帧
- [x] **3.3 质量档位绑定粒子密度** — 封面粒子 grid cap: eco=88, balanced=118, high=148, ultra=183
- [x] **3.4 地形光照按质量降级** — eco/balanced: 1 ambient + 1 directional；high/ultra: 全光照 + spark
- [x] **3.5 升级到 Three.js r160 (WebGL 2.0)** — 纹理 API 适配、InstancedBufferAttribute、色域锁定、shader 自动转换

---

## 📊 预期效果汇总

| 优化项 | 难度 | GPU 降幅 | CPU 降幅 | 视觉影响 |
|---|---|---|---|---|
| 1.1 去 Color 对象化 | ⭐ | 5-10% | 40-60% GC | 无 |
| 1.2 启用 frustum culling | ⭐ | 15-30% | 5% | 无 |
| 1.3 降泡沫网格密度 | ⭐ | 15-25% | 10% | 极微 |
| 1.4 优化 Chromium flags | ⭐ | 5-15% | — | 无 |
| 2.1 Shader 端柱体计算 | ⭐⭐⭐ | 20-30% | 50-70% | 无 |
| 2.2 合并粒子通道 | ⭐⭐ | 25-35% | — | 极微 |
| 2.3 壁纸智能暂停 | ⭐ | 5-10% | — | 无 |
| **Tier 1 合计** | — | **30-50%** | **45-65%** | — |
| **全部合计** | — | **55-75%** | **65-85%** | 极微 |

---

## 🚀 实施记录

- **2026-06-30 Tier 1**：柱体颜色去对象化 + frustum culling + 泡沫网格降密度 + Chromium flags 优化
- **2026-06-30 Tier 2**：柱体权重预计算 + 粒子双通道合并 + 壁纸智能暂停 + 不规则平面优化
- **2026-06-30 Tier 3**：质量档位绑定柱体/粒子密度 + 地形跳帧更新 + 光照按质量降级
- **2026-06-30 Three.js r160**：WebGL 2.0 升级，纹理/InstancedMesh/shader 适配
- **2026-07-01 地形配色**：5 套可切换主题 + UI 选择器
- **全部 100 个测试通过，0 失败 | 10 文件 +595/-229 行**

### 质量档位效果矩阵

| 档位 | 柱体数 | 粒子网格 | 光照 | 帧更新 | 适用场景 |
|---|---|---|---|---|---|
| **eco** | 3,136 | ≤88² | 1 ambient + 1 dir | 每 3 帧 | 省电/低端机 |
| **balanced** | 6,400 | ≤118² | 1 ambient + 1 dir | 隔帧 | 日常使用 |
| **high** | 9,216 | ≤148² | 全光照 + spark | 每帧 | 高性能 |
| **ultra** | 12,544 | ≤183² | 全光照 + spark | 每帧 | 台式机/插电
