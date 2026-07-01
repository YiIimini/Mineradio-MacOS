# 源码编译指南

## 环境要求

- **操作系统**：macOS 12+
- **Node.js**：18.x 或更高
- **npm**：9.x 或更高
- **磁盘空间**：约 500MB（含依赖和编译产物）

## 编译步骤

```bash
# 1. 克隆仓库
git clone https://gitee.com/zhangxiao91207/mineradio-mac-os.git
cd mineradio-mac-os

# 2. 安装依赖
npm install

# 3. 运行测试（确认环境正确）
npm test

# 4. 开发运行（可选，先测试功能）
npm start

# 5. 编译打包（双架构）
npm run build:mac -- --arm64 --x64
```

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
