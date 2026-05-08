#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_appicon="$repo_root/src-tauri/icons/ios/AppIcon.appiconset"
target_assets="$repo_root/src-tauri/gen/apple/Assets.xcassets"
target_appicon="$target_assets/AppIcon.appiconset"

if [ ! -d "$source_appicon" ]; then
  echo "Missing iOS app icon source: $source_appicon" >&2
  exit 2
fi

if [ ! -d "$target_assets" ]; then
  echo "Missing generated iOS asset catalog: $target_assets" >&2
  echo "Run: npx tauri ios init --ci" >&2
  exit 3
fi

rm -rf "$target_appicon"
mkdir -p "$target_assets"
ditto "$source_appicon" "$target_appicon"
echo "Synced iOS AppIcon.appiconset"
