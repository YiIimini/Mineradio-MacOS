# 源码编译指南

## 为什么需要源码编译？

MineradioMacOS 的安装包超过 100MB（Electron 运行时约 100MB + 应用代码约 8MB），无法上传到 Gitee（单文件限制 100MB）。因此需要通过源码自行编译打包。

如果你只是使用，推荐直接从 **[GitHub Releases](https://github.com/YiIimini/Mineradio-MacOS/releases)** 下载编译好的安装包。

## 环境要求

| 项 | 要求 | 检查命令 |
|---|---|---|
| 操作系统 | macOS 12+ | `sw_vers` |
| Node.js | 18.x ~ 22.x | `node -v` |
| npm | 9.x+ | `npm -v` |
| 磁盘空间 | ≥ 500MB | 访达 → 关于本机 → 存储空间 |
| Xcode CLI | 需要（编译原生模块） | `xcode-select -p` |

## 逐步操作

### 1. 安装 Node.js（如已安装可跳过）

推荐使用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node 版本：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.zshrc
nvm install 22
nvm use 22
```

或者从 [nodejs.org](https://nodejs.org) 下载安装包。

### 2. 安装 Xcode Command Line Tools（如未安装）

```bash
xcode-select --install
```

弹出安装窗口，点击"安装"，等待完成（约 2-5 分钟）。

### 3. 克隆仓库

```bash
git clone https://gitee.com/zhangxiao91207/mineradio-mac-os.git
cd mineradio-mac-os
```

### 4. 安装依赖

```bash
npm install
```

这一步会下载 Electron、Three.js 等依赖，首次约需 3-8 分钟（取决于网络速度）。如果下载慢，可以设置国内镜像：

```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### 5. 运行测试（确认环境正确）

```bash
npm test
```

应该输出 `# pass 100 / # fail 0`。如果有失败，检查 Node 版本和依赖是否完整。

### 6. 开发运行（可选）

```bash
npm start
```

此时应用窗口会打开，可以先体验功能，确认一切正常后按 `Ctrl+C` 退出。

### 7. 编译打包

```bash
# Apple Silicon (M1-M4) + Intel 双架构
npm run build:mac -- --arm64 --x64
```

如果只想编译当前机器架构：

```bash
npm run build:mac
```

编译约需 2-5 分钟。首次编译需要下载 Electron 二进制文件（~100MB），后续编译会复用缓存。

## 编译产物

```
dist/
├── Mineradio-MacOS-{version}-mac-arm64.dmg   # Apple Silicon (M1-M4)
├── Mineradio-MacOS-{version}-mac-arm64.zip
├── Mineradio-MacOS-{version}-mac-x64.dmg     # Intel
└── Mineradio-MacOS-{version}-mac-x64.zip
```

## 安装

1. 打开 `.dmg`，将 MineradioMacOS 拖入 Applications 文件夹
2. **首次打开**：右键（Control+点击）→ 选择"打开" → 再次点击"打开"
3. 之后可正常双击打开

> 首次提示"无法验证开发者"是因为应用未经过 Apple 付费签名，右键打开可绕过。

## 常见问题

**Q: `npm install` 报错？**
A: 确保 Node.js 18+，尝试 `npm cache clean --force` 后重试。

**Q: 编译失败？**
A: 检查磁盘空间是否充足（至少 500MB），确认 Xcode Command Line Tools 已安装。

**Q: 只想编译当前架构？**
A: 去掉 `--x64` 或 `--arm64`，如 `npm run build:mac` 只编译当前机器架构。
