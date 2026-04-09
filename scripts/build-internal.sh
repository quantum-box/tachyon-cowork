#!/usr/bin/env bash
# -------------------------------------------------------------------
# build-internal.sh - 社内配布用ビルドスクリプト（署名なし）
#
# コード署名なしで Tauri アプリをビルドします。
# 社内テスト・評価目的の配布に使用してください。
#
# 使い方:
#   ./scripts/build-internal.sh          # debug ビルド
#   ./scripts/build-internal.sh release  # release ビルド（署名なし）
# -------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_MODE="${1:-debug}"

cd "$PROJECT_DIR"

echo "=== Tachyon Cowork 社内配布用ビルド ==="
echo "モード: $BUILD_MODE"
echo ""

# 前提条件チェック
check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: $1 が見つかりません。インストールしてください。"
    exit 1
  fi
}

check_command node
check_command npm
check_command rustc
check_command cargo

# Node.js バージョンチェック
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node.js 20 以上が必要です (現在: $(node -v))"
  exit 1
fi

# .env ファイルチェック
if [ ! -f .env ]; then
  echo "WARNING: .env ファイルがありません。.env.example からコピーします。"
  cp .env.example .env
fi

# npm 依存インストール
echo ""
echo "--- npm 依存のインストール ---"
npm install

# ビルド実行
echo ""
echo "--- Tauri ビルド開始 ---"

if [ "$BUILD_MODE" = "release" ]; then
  cargo tauri build 2>&1
else
  cargo tauri build --debug 2>&1
fi

# macOS の場合、ad-hoc 署名を適用
if [ "$(uname)" = "Darwin" ]; then
  echo ""
  echo "--- macOS: ad-hoc コード署名を適用 ---"
  if [ "$BUILD_MODE" = "release" ]; then
    BUNDLE_DIR="src-tauri/target/release/bundle"
  else
    BUNDLE_DIR="src-tauri/target/debug/bundle"
  fi

  APP_PATH=$(find "$BUNDLE_DIR/macos" -name "*.app" -maxdepth 1 2>/dev/null | head -1)
  if [ -n "$APP_PATH" ]; then
    codesign --force --deep -s - "$APP_PATH"
    echo "署名完了: $APP_PATH"
  fi
fi

echo ""
echo "=== ビルド完了 ==="
echo ""

# 成果物の一覧を表示
if [ "$BUILD_MODE" = "release" ]; then
  BUNDLE_DIR="src-tauri/target/release/bundle"
else
  BUNDLE_DIR="src-tauri/target/debug/bundle"
fi

echo "成果物:"
if [ -d "$BUNDLE_DIR" ]; then
  find "$BUNDLE_DIR" -type f \( \
    -name "*.dmg" -o \
    -name "*.app" -o \
    -name "*.exe" -o \
    -name "*.msi" -o \
    -name "*.AppImage" -o \
    -name "*.deb" \
  \) 2>/dev/null | while read -r f; do
    SIZE=$(du -h "$f" | cut -f1)
    echo "  $f ($SIZE)"
  done
fi

echo ""
echo "配布時の注意:"
echo "  - macOS: 利用者に xattr -cr <app_path> の実行を案内してください"
echo "  - Windows: SmartScreen の警告が出ます。「詳細情報」→「実行」で起動できます"
echo "  - 自動アップデートは署名なしビルドでは無効です"
