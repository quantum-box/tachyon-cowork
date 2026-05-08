#!/usr/bin/env bash
set -euo pipefail

ipa_path="${IOS_IPA_PATH:-src-tauri/gen/apple/build/arm64/Tachyon Cowork.ipa}"

if [ ! -f "$ipa_path" ]; then
  echo "Missing IPA: $ipa_path" >&2
  exit 2
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

unzip -q "$ipa_path" -d "$tmp_dir"
app_dir="$tmp_dir/Payload/Tachyon Cowork.app"
info_plist="$app_dir/Info.plist"

icon_name="$(plutil -extract CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName raw "$info_plist")"
test "$icon_name" = "AppIcon"
test -s "$app_dir/AppIcon60x60@2x.png"
test -s "$app_dir/Assets.car"

if command -v sips >/dev/null 2>&1; then
  alpha="$(sips -g hasAlpha "$app_dir/AppIcon60x60@2x.png" 2>/dev/null | awk '/hasAlpha/ {print $2}')"
  test "$alpha" = "no"
fi

echo "Verified iOS AppIcon assets in IPA"
