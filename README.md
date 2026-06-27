# Mineradio (macOS)

Mineradio 是一款沉浸式桌面音乐播放器，将天气电台、搜索播放、歌词舞台、粒子视觉和 3D 歌单架组合成一个更接近现场感的私人音乐空间。

本项目基于 [XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio) 原作，适配了 macOS 平台的构建与运行。

## 当前版本

`1.2.0`

## 核心特性

- Open-Meteo 天气电台，根据位置、城市和天气 mood 生成播放队列
- 首页包含天气电台、每日推荐、私人电台、继续听、听歌画像和歌单入口
- Wallpaper 银河首页背景，未播放时保持星河氛围
- 播放后切换到 Emily / 默认播放态视觉，歌词舞台与粒子舞台同步
- 基于节奏的电影镜头视觉系统
- 面向长播客和 DJ 曲目的专属视觉模式
- 歌词舞台、自定义歌词、歌词位置与视觉控制
- 自定义专辑封面上传与裁剪
- 右键唤起 3D 歌单架，支持歌单队列浏览
- 网易云音乐账号、搜索、歌单、播客体验接入
- QQ 音乐搜索、登录态与音源补充接入
- GitHub Releases 更新检测与下载入口
- 首次启动内置默认视觉用户存档

## 开发运行

```bash
npm install
npm start
npm run build:mac          # DMG + ZIP
npm run build:mac:dir      # 仅解包目录
```

桌面版入口由 Electron 主进程加载本地服务，构建产物位于 `dist/`。

## 更新机制

Mineradio 会请求 GitHub Releases latest 检测新版本，远端版本高于本地时展示 Release 内容并引导下载。

## 第三方音乐平台说明

Mineradio 不是网易云音乐、QQ 音乐或腾讯音乐娱乐集团的官方客户端，也不隶属于任何音乐平台。

项目中的第三方平台接入仅用于个人学习、本地客户端体验和用户自有账号的播放辅助。请遵守对应平台的用户协议、版权规则和会员权益规则。项目不提供绕过付费、绕过会员、破解音质或重新分发音乐内容的能力。

## 用户数据与隐私

登录 Cookie、搜索历史、自定义封面、自定义歌词、节奏分析缓存等数据仅保存在本机用户数据目录或浏览器本地存储中。

更多说明见 [PRIVACY.md](./PRIVACY.md)。

## 致谢

本项目基于 [XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio) 的原作移植，感谢 XxHuberrr 大佬的设计与开源分享。

同时也感谢 emily、小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦 在早期体验与测试反馈中的帮助。

## 版权与授权

本项目采用 GPL-3.0 授权。详见 [LICENSE](./LICENSE)。

第三方依赖和第三方服务分别遵循其各自授权与服务条款。
