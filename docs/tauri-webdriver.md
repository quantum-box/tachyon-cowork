# Tauri WebDriver on macOS

This app includes `tauri-plugin-webdriver-automation` in debug builds.

## What changed

- `src-tauri` registers the plugin only under `debug_assertions`
- running the app in debug mode prints a line like:

```text
[webdriver] listening on port 54946
```

## Local setup

Install the WebDriver bridge CLI once:

```bash
cargo install tauri-webdriver-automation --locked
```

Start the WebDriver server:

```bash
tauri-wd --port 4444
```

Then create a W3C WebDriver session with the app binary:

```json
{
  "capabilities": {
    "alwaysMatch": {
      "tauri:options": {
        "binary": "./src-tauri/target/debug/tachyon-cowork"
      }
    }
  }
}
```

## Notes

- The plugin is for debug builds only.
- The app binary is launched by `tauri-wd`, not by `agent-browser`.
- This bridges macOS Tauri `WKWebView` into WebDriver, which Tauri's default `tauri-driver` does not support on macOS.
