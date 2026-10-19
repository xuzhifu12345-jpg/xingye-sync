# QianFan Sync · 桌面客户端（P0 骨架）

Electron + electron-builder 桌面壳，把现有 QianFan Sync 整合包升级为「双击即装」的桌面应用。
方案详见 [`../docs/桌面客户端打包方案.md`](../docs/桌面客户端打包方案.md)。

## 当前进度

- ✅ **P0 技术验证**（本骨架）：Electron 空壳 + runtime 解压 + Python 后端拉起 + /api/health + BrowserWindow
- ⏳ P1 后端生产化（Flask dist 托管、SPA fallback、/api/runtime/*）
- ⏳ P2 运行时管理器（CDN 备用通道、sha256、repair）
- ⏳ P3 设置界面（安全中心 / 运行时卡片 / 审计）
- ⏳ P4 三端打包流水线（NSIS / dmg / deb+AppImage）

## 目录

```
desktop/
├── src/main/         Electron 主进程
│   ├── index.ts      生命周期 / 单实例 / 主窗口
│   ├── backend.ts    spawn Python 后端 + /api/health 轮询
│   ├── runtime.ts    runtime-seed → runtime/ 解压与探测
│   ├── paths.ts      跨平台目录解析
│   └── log.ts        shell.log 统一日志
├── src/preload/      window.qfsShell 注入
├── build/            icon / NSIS 文案 / entitlements.mac.plist
├── electron-builder.yml
├── tsconfig.json
└── package.json
```

## P0 验收步骤（开发模式）

```bash
cd desktop
npm install                            # 安装 electron + electron-builder + typescript
npm run build:main                     # tsc 编译 src → dist
(cd ../frontend && npm run build)      # 生成 frontend/dist 给 Flask 托管
npm run dev                            # tsc -w + electron .  （P0 不依赖 runtime-seed）
```

P0 模式下主进程会：

1. 检测 `runtime-seed/` 缺失 → 跳过拷贝（开发模式标记）
2. 直接调用系统 PATH 上的 python（dev 环境）
3. spawn 后端 `app.py`，cwd = `../backend`
4. 轮询 `http://127.0.0.1:5409/api/health`
5. 主窗口加载 `http://127.0.0.1:5409/`

## P0 验收步骤（生产模式 · 离线完整包）

```bash
# 1. 准备 runtime-seed（用户机器上的 dependency/ 拼过来）
bash scripts/build-runtime-seed.sh

# 2. 编译 + 打包
npm run build
npm run dist:win                       # Windows NSIS
# npm run dist:mac                     # macOS dmg（未签名，需右键打开）
# npm run dist:linux                   # AppImage + deb

# 3. 安装包位置
ls release/                            # 千帆云递-Setup-1.3.0-alpha.1-x64.exe
```

## 已知限制（P0 范围）

- 不实现 P1+ 运行时管理 API、设置界面、托盘、自动更新
- 不实现进程树收割（仅杀 python 子进程，chrome 残留需手动）
- 不实现 CDN 通道（仅本地 runtime-seed）
- macOS 安装包未签名（§12 决策 6）
- Windows 安装包未签名（SmartScreen 拦截，文档待补）