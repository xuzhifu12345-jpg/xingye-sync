#!/usr/bin/env bash
# 拼装 desktop/runtime-seed/ 目录树（已解压形态）
# 用法：bash scripts/build-runtime-seed.sh win-x64
set -euo pipefail

PLATFORM="${1:-win-x64}"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED_DIR="$PROJECT_ROOT/desktop/runtime-seed"
CB_SOURCE="$PROJECT_ROOT/../配套指纹浏览器"

echo "==== 拼装 runtime-seed for $PLATFORM ===="
rm -rf "$SEED_DIR"
mkdir -p "$SEED_DIR/bin"

ok()   { echo "  [OK]   $1"; }
info() { echo "  [INFO] $1"; }
warn() { echo "  [WARN] $1"; }

case "$PLATFORM" in
  win-x64)
    # 1) CloakBrowser：从 D:\work\配套指纹浏览器\ 解压
    CB_ARCHIVE="$CB_SOURCE/cloakbrowser-windows-x64.zip"
    if [[ ! -f "$CB_ARCHIVE" ]]; then
      warn "未找到 $CB_ARCHIVE，请确认路径"
    else
      mkdir -p "$SEED_DIR/cloakbrowser"
      unzip -o -q "$CB_ARCHIVE" -d "$SEED_DIR/cloakbrowser"
      ok "CloakBrowser → $SEED_DIR/cloakbrowser/"
    fi

    # 2) Python：从 backend/.venv 复制（已含全部 Python 依赖）
    if [[ -d "$PROJECT_ROOT/backend/.venv" ]]; then
      cp -r "$PROJECT_ROOT/backend/.venv" "$SEED_DIR/python"
      ok "Python (含 site-packages) → $SEED_DIR/python/"
    else
      warn "未找到 backend/.venv — Python runtime 将缺失"
    fi

    # 3) Node：从 C:\Program Files\nodejs\ 复制
    #    注意：必须剔除系统全局 node_modules（用户全局安装的包与本项目无关，
    #    例如 openclaw 一项就 363MB）。
    NODE_SRC="$PROGRAMFILES/nodejs"
    [[ -z "$NODE_SRC" || ! -d "$NODE_SRC" ]] && NODE_SRC="/c/Program Files/nodejs"
    if [[ -d "$NODE_SRC" ]]; then
      mkdir -p "$SEED_DIR/node"
      cp -r "$NODE_SRC/." "$SEED_DIR/node/"
      rm -rf "$SEED_DIR/node/node_modules/openclaw"   # 系统全局 AI 网关工具，与本项目无关
      ok "Node.js → $SEED_DIR/node/"
    else
      warn "未找到 $NODE_SRC — Node runtime 将缺失（MCP 不可用）"
    fi

    # 4) Git：从 /mingw64/ 复制（MinGit 等价）
    if [[ -d "/mingw64" ]]; then
      mkdir -p "$SEED_DIR/git/cmd" "$SEED_DIR/git/bin"
      cp /mingw64/bin/git.exe "$SEED_DIR/git/cmd/" 2>/dev/null || true
      cp /mingw64/bin/git "$SEED_DIR/git/bin/" 2>/dev/null || true
      cp -r /mingw64/etc "$SEED_DIR/git/" 2>/dev/null || true
      ok "Git (MinGit 裁剪版) → $SEED_DIR/git/"
    else
      warn "未找到 /mingw64 — Git runtime 将缺失"
    fi

    # 5) ffmpeg/ffprobe：从 /d/software/ffmpeg/ 复制
    FFMPEG_SRC="/d/software/ffmpeg"
    if [[ -d "$FFMPEG_SRC" ]]; then
      cp "$FFMPEG_SRC/ffmpeg.exe"  "$SEED_DIR/bin/" 2>/dev/null || true
      cp "$FFMPEG_SRC/ffprobe.exe" "$SEED_DIR/bin/" 2>/dev/null || true
      ok "ffmpeg + ffprobe → $SEED_DIR/bin/"
    else
      warn "未找到 $FFMPEG_SRC — 视频帧抽取不可用"
    fi
    ;;

  mac-arm64|mac-x64|linux-x64)
    echo "  ⚠ $PLATFORM 暂未实现（参考 win-x64 实现）"
    exit 1
    ;;

  *) echo "不支持: $PLATFORM"; exit 1 ;;
esac

echo ""
echo "==== runtime-seed 完成 ===="
du -sh "$SEED_DIR"/* 2>/dev/null
TOTAL=$(du -sh "$SEED_DIR" | awk '{print $1}')
echo "  总计: $TOTAL"