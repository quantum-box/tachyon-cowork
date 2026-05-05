# Mobile Roadmap

Tachyon Cowork can target mobile through two steps:

1. Keep a web/PWA-compatible chat MVP working without desktop-only Tauri APIs.
2. Add Tauri v2 iOS/Android shells once the mobile-safe feature set is clear.

## Mobile MVP

The first mobile build should focus on the core assistant loop:

- Sign in and token refresh
- Model selection
- Chat send/receive
- Session history
- Artifact viewing for text/code-friendly outputs
- Basic settings that do not depend on local host capabilities

## Desktop-only Features

These features are intentionally gated to Tauri desktop for now:

- Local workspace folder selection
- Work folder pages and project custom instructions backed by host files
- Local file tools: search, organize, duplicate detection, disk usage
- Host command execution
- Sandbox code execution
- MCP stdio and child-process transports
- Global shortcuts
- Self updater and process relaunch
- OS file-manager integration such as showing a file in Finder

## Current Implementation Notes

- `src/lib/tauri-bridge.ts` exposes `isTauriDesktop()` and `isTauriMobile()`.
- `src/App.tsx` only shows file tools and work-folder routes on Tauri desktop.
- `vite.config.ts` respects `TAURI_DEV_HOST` for Tauri mobile dev server/HMR.
- `src-tauri/src/lib.rs` keeps updater, process relaunch, global shortcuts, and eager MCP connection on desktop only.

## Follow-up Issues

- #49: Define and verify the mobile Web/PWA MVP.
- #50: Initialize Tauri iOS/Android projects and build commands.
- #51: Continue feature-gating desktop-only APIs.
- #52: Redesign the chat-first mobile UI.
- #53: Design mobile-native auth callback, file picking, notifications, and secure storage.
