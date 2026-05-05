# App Store Release Notes

This note records the iOS/TestFlight release flow for Tachyon Cowork.

## Current App Store Setup

- Bundle ID: `com.quantumbox.tachyon-cowork`
- App Store Connect app ID: `6766439377`
- Apple Developer Team ID is configured in `src-tauri/tauri.conf.json`.
- App Store Connect API upload uses a `.p8` key from `~/Downloads` by default.

Do not commit the `.p8` key. `mise.toml` copies it into
`~/.appstoreconnect/private_keys/` before calling `xcrun altool`.

## Release Command

```bash
mise run ios:release
```

This runs:

```bash
mise run ios:build
mise run ios:upload
```

The generated IPA path is:

```text
src-tauri/gen/apple/build/arm64/Tachyon Cowork.ipa
```

Override values when needed:

```bash
IOS_BUILD_NUMBER=5051657 mise run ios:build
IOS_IPA_PATH="src-tauri/gen/apple/build/arm64/Tachyon Cowork.ipa" mise run ios:upload
APP_STORE_CONNECT_KEY_ID=... APP_STORE_CONNECT_ISSUER_ID=... APP_STORE_CONNECT_KEY_PATH=... mise run ios:upload
```

## Build Number

`ios:build` generates a numeric build suffix from the current date/time:

```bash
date +%m%d%H%M | sed 's/^0*//'
```

Tauri appends it to `version` from `tauri.conf.json`. For example:

```text
0.1.1.5051656
```

The value must fit Tauri's `u32` build-number limit, so do not use a full
`YYYYMMDDHHMM` timestamp.

## Known Build Fixes

iOS/Android builds must not compile desktop-only dependencies. The current
mobile release depends on these guards:

- `microsandbox`, `trash`, and `tauri-plugin-webdriver-automation` are under
  desktop-only target dependencies in `src-tauri/Cargo.toml`.
- `tauri-plugin-webdriver-automation` is only registered for
  `all(debug_assertions, desktop)`.
- sandbox execution and file generation return unsupported errors on mobile.
- `move_to_trash` returns an unsupported error on mobile.

Before a release, this is the quick Rust check:

```bash
cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-apple-ios --lib
```

## Long Build Behavior

`tauri ios build` can compile the Rust iOS release library twice:

1. normal iOS release build
2. archive build for export

This can look stalled because Xcode is quiet for long periods. Check progress
with:

```bash
ps -o pid,ppid,stat,pcpu,pmem,etime,command -p $(pgrep -f 'tauri ios build|xcodebuild.*tachyon-cowork|tauri ios xcode-script|cargo build --package tachyon-cowork|rustc --crate-name tachyon_cowork_lib' | paste -sd, -)
find src-tauri/target/aarch64-apple-ios/release -maxdepth 2 -type f -mmin -5 -print | head
```

If `xcodebuild` reports `build.db` is locked, look for old simulator/debug
build processes and stop only the stale `tachyon-cowork` Xcode/Tauri process.

## Upload Verification

After upload, confirm the latest App Store Connect build:

```bash
ruby -ropenssl -rjson -rbase64 -rnet/http -ruri -e 'puts "Use the local App Store Connect JWT check from the release runbook"'
```

The successful May 5, 2026 upload produced:

```text
version: 0.1.1.5051656
processingState: VALID
expired: false
```

If TestFlight does not show the build immediately, wait for App Store Connect
processing and refresh the build list.

## Icon Notes

The generated IPA should include iOS app icons through the generated Xcode asset
catalog. When checking an icon issue, inspect the IPA instead of only relying on
the App Store Connect screen:

```bash
unzip -l "src-tauri/gen/apple/build/arm64/Tachyon Cowork.ipa" | rg 'AppIcon|Assets.car'
```

The marketing icon should come from the generated
`Assets.xcassets/AppIcon.appiconset` `ios-marketing` entry.
