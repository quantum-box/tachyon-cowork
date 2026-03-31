---
name: tauri-webdriver-macos
description: Use when you need to automate or test a macOS Tauri app through tauri-webdriver-automation, especially when agent-browser cannot control the native app window. Triggers include requests to launch a Tauri mac app, verify native-window behavior on macOS, create WebDriver smoke tests for a Tauri app, or wire tauri-plugin-webdriver-automation into a repo.
---

# Tauri WebDriver macOS

## Overview

Use this skill for macOS Tauri apps backed by `WKWebView`. `agent-browser` can drive Chromium and Electron well, but it does not directly control a Tauri mac app window. This skill uses `tauri-plugin-webdriver-automation` inside the app and `tauri-wd` outside the app to create a W3C WebDriver surface.

## When to use

- The user wants to automate a Tauri app running on macOS.
- `agent-browser` can only reach the dev server URL, not the native app.
- The repo needs macOS smoke tests or DOM inspection for a Tauri app.
- You need to prove whether a Tauri window can be launched and queried through WebDriver.

Do not use this skill for Electron apps. Use the Electron/CDP path instead.

## Workflow

### 1. Inspect the app mode

Check `src-tauri/tauri.conf.json` first.

- If `build.devUrl` is set, the app expects a frontend dev server during debug runs.
- If the app uses bundled assets only, the debug binary may be launchable directly.

Also inspect `src-tauri/src/lib.rs` or `src-tauri/src/main.rs` to see where plugins are registered.

### 2. Wire the plugin into the Tauri app

Add the Rust dependency in `src-tauri/Cargo.toml`:

```toml
tauri-plugin-webdriver-automation = "0.1.3"
```

Register it in debug builds only:

```rust
let mut builder = tauri::Builder::default();

#[cfg(debug_assertions)]
{
    builder = builder.plugin(tauri_plugin_webdriver_automation::init());
}
```

Keep this plugin behind `debug_assertions`. Do not enable it in release builds unless the user explicitly asks for that.

### 3. Validate the Rust side

Run:

```bash
cd src-tauri
cargo check
```

If `cargo check` passes, the dependency wiring is likely correct.

### 4. Install the WebDriver bridge CLI

Install once on the machine:

```bash
cargo install tauri-webdriver-automation --locked
```

This provides `tauri-wd`.

### 5. Start the app for automation

If `devUrl` is present, start the frontend dev server first, usually with `npm run dev`.

Start the WebDriver bridge in a separate terminal:

```bash
tauri-wd --port 4444 --log-level debug
```

Create a session by pointing WebDriver at the debug app binary:

```bash
curl -s -X POST http://127.0.0.1:4444/session \
  -H 'Content-Type: application/json' \
  -d '{
    "capabilities": {
      "alwaysMatch": {
        "tauri:options": {
          "binary": "/abs/path/to/src-tauri/target/debug/your-app"
        }
      }
    }
  }'
```

Successful startup usually means:

- `GET /status` returns ready
- session creation returns a `sessionId`
- the app process launches automatically
- the app logs a line like `[webdriver] listening on port N`

### 6. Prove control with read-only commands first

Before attempting form automation, confirm the session can read state:

```bash
curl -s http://127.0.0.1:4444/status
curl -s http://127.0.0.1:4444/session/$SESSION_ID/title
curl -s http://127.0.0.1:4444/session/$SESSION_ID/url
curl -s -X POST http://127.0.0.1:4444/session/$SESSION_ID/element \
  -H 'Content-Type: application/json' \
  -d '{"using":"css selector","value":"h1"}'
```

If title, URL, and element lookup succeed, the native Tauri app is under WebDriver control.

### 7. Then try writes and clicks

Use standard W3C WebDriver endpoints:

- `POST /session/{id}/element`
- `POST /session/{id}/element/{eid}/click`
- `POST /session/{id}/element/{eid}/value`
- `POST /session/{id}/execute/sync`

For simple inputs, `element/{eid}/value` may be enough.

For React controlled inputs, sending `value` can update the DOM property without updating framework state. If that happens, prefer `execute/sync` and fire the same events the app expects.

Example:

```bash
curl -s -X POST http://127.0.0.1:4444/session/$SESSION_ID/execute/sync \
  -H 'Content-Type: application/json' \
  -d '{
    "script": "const el = document.querySelector(\"input\"); el.focus(); el.dispatchEvent(new InputEvent(\"input\", { bubbles: true, data: \"a\", inputType: \"insertText\" })); return document.activeElement === el;",
    "args": []
  }'
```

If the app still does not react, inspect how the framework wires input state before concluding the bridge is broken.

## What success looks like

- The macOS Tauri app launches through `tauri-wd`.
- You can read title, URL, and DOM elements from the native app window.
- You can click or type into at least one element, or you can prove the gap is specifically a framework-event issue.

## Common pitfalls

- `tauri-driver` is not enough on macOS for `WKWebView`. Use this bridge instead.
- If `devUrl` exists and the frontend server is not running, the app may launch but not load usable content.
- A DOM `value` change is not the same as a React state change.
- Running `tauri dev` manually is not required for WebDriver sessions. `tauri-wd` launches the binary named in `tauri:options.binary`.
- Keep the cleanup explicit. Delete the session when done and stop `tauri-wd` plus any frontend dev server you started.

## Close-out

When finishing:

- report whether session creation succeeded
- report whether read operations succeeded
- report whether write operations succeeded or stalled at framework state updates
- mention the exact binary path, port, and whether a dev server was required
