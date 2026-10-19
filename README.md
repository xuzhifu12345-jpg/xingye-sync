<div align="center">

# 星野 · XingYe

**一站式多平台自媒体矩阵自动发布系统** · 一个界面，把内容分发到全网

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-42b883.svg)](./changelog)
[![Platforms](https://img.shields.io/badge/platforms-19-ff6b6b.svg)](#-支持平台)

🇨🇳 简体中文

</div>

---

## 📖 项目简介

**星野（XingYe  / 星野自媒体矩阵助手）** 是一款现代化的多平台社交媒体自动发布工具，专注解决内容创作者、电商视觉团队与矩阵运营者「**一份素材、多端分发**」的痛点。

无论你是个人创作者、电商独立站卖家、MCN 机构还是企业新媒体运营，都需要在十几个平台之间反复切换、重复粘贴上传——**星野云递**把这一切收敛到**一个界面**：拖入视频/图集 → 勾选平台与账号 → 填写一次标题/标签/封面 → 一键发布，剩下的全部交给自动化。

整体采用 **Vue 3 前端 + Python Flask 后端 + TypeScript MCP 服务** 的三层架构，以本地 Web 服务形式运行，所有账号 Cookie 与素材数据全部安全保存在本地电脑。

### ✨ 核心特性

| 能力 | 说明 |
|------|------|
| 🚀 **多平台一键发布** | 支持 19 个国内外主流内容与电商平台，一次操作同步分发到多个账号 |
| 🏷️ **账号标签体系** | 账号支持多标签分组管理，按标签/渠道多维度筛选目标矩阵账号 |
| 📅 **定时排程发布** | 日历式排程，支持全量/增量两种批量定时发布模式 |
| 🎬 **视频 + 图集双形态** | 既支持短视频分发，也支持图文/图集发布（小红书、抖音、快手等） |
| 🖼️ **可视化封面编辑** | 内置封面裁剪编辑器、多比例画幅、自动抽取视频关键帧生成缩略图 |
| 📊 **实时任务中心** | 实时发布状态追踪，异步任务队列管理，支持失败任务一键重试 |
| 🗂️ **本地素材中心** | 统一的视频/图片素材库管理，按平台分类存储与快速调用 |
| 🛡️ **渠道显示配置** | 支持屏蔽不常用的平台渠道，打造清爽专注的工作台界面 |
| 🔍 **智能视频校验** | 上传即自动识别时长、分辨率与文件大小，前后端双重校验避免发布失败 |
| 🕵️ **防关联隐身环境** | 基于 CloakBrowser 隐身 Chromium 内核，降低自动化检测与账号关联风险 |
| 🤖 **MCP 智能体接入** | 支持通过自然语言驱动 AI Agent（如 Claude / Cursor）调用发布接口 |

---

## 🌐 支持平台

目前接入 **19 个**国内外主流平台，全面覆盖短视频、图文种草、跨境社媒与电商内容渠道：

<table>
  <tr>
    <td align="center"><img src="./frontend/src/assets/logos/xiaohongshu.png" width="40" /><br><b>小红书</b><br><sub>id=1</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/shipinhao.png" width="40" /><br><b>视频号</b><br><sub>id=2</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/douyin.png" width="40" /><br><b>抖音</b><br><sub>id=3</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/kuaishou.png" width="40" /><br><b>快手</b><br><sub>id=4</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/bilibili.png" width="40" /><br><b>哔哩哔哩</b><br><sub>id=5</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./frontend/src/assets/logos/baijiahao.png" width="40" /><br><b>百家号</b><br><sub>id=6</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/tiktok.png" width="40" /><br><b>TikTok</b><br><sub>id=7</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/youtube.png" width="40" /><br><b>YouTube</b><br><sub>id=8</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/tengxunshipin.png" width="40" /><br><b>腾讯视频</b><br><sub>id=9</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/aiqiyi.png" width="40" /><br><b>爱奇艺</b><br><sub>id=10</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./frontend/src/assets/logos/weibo.png" width="40" /><br><b>微博</b><br><sub>id=11</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/alipay.png" width="40" /><br><b>支付宝</b><br><sub>id=12</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/toutiao.png" width="40" /><br><b>今日头条</b><br><sub>id=13</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/zhihu.png" width="40" /><br><b>知乎</b><br><sub>id=14</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/csdn.png" width="40" /><br><b>CSDN</b><br><sub>id=15</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./frontend/src/assets/logos/vivo.svg" width="40" /><br><b>VIVO</b><br><sub>id=16</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/weixin_gzh.png" width="40" /><br><b>微信公众号</b><br><sub>id=17</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/taobao_guanghe.png" width="40" /><br><b>淘宝光合</b><br><sub>id=18</sub></td>
    <td align="center"><img src="./frontend/src/assets/logos/jingmai.png" width="40" /><br><b>京东京麦</b><br><sub>id=19</sub></td>
    <td align="center"></td>
  </tr>
</table>

---

## 🛠️ 技术栈

| 层级 | 技术方案 |
|------|----------|
| **前端界面** | Vue 3 · Vite · Element Plus · Pinia · Vue Router · SCSS |
| **后端核心** | Python Flask · flask-async · Waitress · SQLite |
| **浏览器自动化** | Playwright · CloakBrowser（防检测隐身 Chromium） |
| **MCP 服务** | TypeScript · Model Context Protocol SDK |
| **媒体处理** | OpenCV · FFmpeg / FFprobe |

---

## 🚀 快速启动

### 环境要求

- **Python 3.10+**
- **Node.js 18+**
- **FFmpeg / FFprobe**（用于视频时长识别与封面帧抽取）
- *(可选)* 支持在项目根目录创建 `dependency/` 便携式依赖文件夹（放入内置 `python`、`node`、`bin/ffmpeg.exe`），即可实现免安装绿色运行。

### 方式一：Windows 一键脚本启动（推荐 ✨）

项目根目录提供了一键启动脚本，双击运行 `start.bat` 即可自动完成：
1. 检查本地或内置 `dependency` 运行环境
2. 自动清理占用的端口（5409 / 5173 / 5410）
3. 自动创建虚拟环境并安装前后端依赖
4. 启动后端、前端与 MCP 服务，并自动在浏览器打开操作界面

```bash
start.bat           # Windows 双击直接运行
./start.sh          # Linux
./start-macos.sh    # macOS

🙏 开源致谢
本项目基于以下优秀开源项目进行定制化重构与二次开发，特此致谢：

dreammis/social-auto-upload

DevilJie/social-auto-upload-web-ui

📄 开源许可
本项目遵循 MIT License 开源协议。

免责声明：本软件仅供技术学习、个人效率提升与内部合规运营使用，使用者需自行承担因自动化操作产生的一切风险与责任，请严格遵守各内容平台的相关服务条款。
