#!/usr/bin/env bash
# AppIcon.svg からアプリアイコンを再生成し、リリースビルドを行う。
# 使い方: pnpm rebuild:icon  (または bash scripts/rebuild-icon.sh)
set -euo pipefail

cd "$(dirname "$0")/.."

SVG="AppIcon.svg"
WORKDIR="$(mktemp -d)"
PNG="$WORKDIR/AppIcon-1024.png"
trap 'rm -rf "$WORKDIR"' EXIT

if [ ! -f "$SVG" ]; then
  echo "Error: $SVG が見つかりません" >&2
  exit 1
fi

echo "==> Converting $SVG -> 1024x1024 PNG..."
if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 1024 -h 1024 "$SVG" -o "$PNG"
elif command -v qlmanage >/dev/null 2>&1; then
  qlmanage -t -s 1024 -o "$WORKDIR" "$SVG" >/dev/null
  mv "$WORKDIR/$(basename "$SVG").png" "$PNG"
else
  echo "Error: rsvg-convert または qlmanage が必要です (brew install librsvg 推奨)" >&2
  exit 1
fi

echo "==> Generating src-tauri/icons/ (pnpm tauri icon)..."
pnpm tauri icon "$PNG"

echo "==> Building release app (pnpm tauri build)..."
pnpm tauri build

echo "==> Clearing macOS icon cache..."
if sudo -n true 2>/dev/null || [ -t 0 ]; then
  sudo rm -rf /Library/Caches/com.apple.iconservices.store
  sudo killall Dock
else
  echo "    (sudo を実行できないためスキップ。必要なら手動で以下を実行:)"
  echo "      sudo rm -rf /Library/Caches/com.apple.iconservices.store"
  echo "      sudo killall Dock"
fi

echo ""
echo "Done! Launch the new app:"
echo "  open src-tauri/target/release/bundle/macos/diffwww.app"
