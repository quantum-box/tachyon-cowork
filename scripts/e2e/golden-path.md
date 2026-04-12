# Golden Path — Tauri WebDriver harness (scaffold)

> Status: **scaffold only**. Full execution requires the exhibition PC (macOS/Windows) with a display and a built debug binary. This document captures the commands for the operator or on-site engineer.

## Why this is a scaffold, not a runnable script

`tauri-plugin-webdriver-automation` is only registered under `debug_assertions` (see `docs/tauri-webdriver.md`), so Golden Path automation needs a **debug** build, not the release `.dmg`/`.msi` operators install. Running it also needs a desktop session — not available on the Sakura VPS where CI-side validation lives. We therefore document the harness and let the on-site engineer execute it.

## Prereqs (on the exhibition PC or a developer Mac)

```bash
cargo install tauri-webdriver-automation --locked
npm i -D webdriverio @wdio/cli @wdio/local-runner @wdio/mocha-framework  # optional, if using WDIO
```

## Run

1. Build debug binary: `cargo tauri build --debug` (or `npm run tauri dev` in a separate shell).
2. Start the WebDriver bridge: `tauri-wd --port 4444`
3. Create session with `tauri:options.binary` pointing at the debug binary (`src-tauri/target/debug/tachyon-cowork` on macOS/Linux; `.exe` on Windows).

Session capabilities:

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

## Golden Path script outline (pseudocode)

```ts
// scripts/e2e/golden-path.spec.ts (to be implemented on exhibition PC)
await driver.waitForUrl(/\/login/);
await driver.$('#cognito-signin').click();
// Cognito Hosted UI flow (runs in system browser via deep-link) — the harness
// needs to hand control back to the human for the actual username/password
// entry since we do not want test credentials in CI.

await driver.waitForUrl(/\/projects/);
await driver.$('[data-testid=new-project]').click();
await driver.$('[data-testid=project-name]').setValue('展示会デモ');
await driver.$('[data-testid=create-project]').click();

await driver.$('[data-testid=record-start]').click();
await driver.pause(30_000);
await driver.$('[data-testid=record-stop]').click();

await driver.$('[data-testid=minutes-panel]').waitForDisplayed({ timeout: 60_000 });
```

## Known gaps to close before running

- Verify the above `data-testid` attributes actually exist in the current UI. If not, add them first (non-visual change, low risk) or switch to role/text selectors.
- Cognito step: Hosted UI runs in the system browser via `plugin-deep-link`; the harness cannot automate that frame. The operator drives login manually, harness resumes after redirect.
- 30-second recording: replace with a short pre-recorded WAV fed via a virtual mic (macOS: BlackHole; Windows: VB-Audio) if fully unattended runs are desired post-exhibition.

## Decision for 4/15 exhibition

The manual Golden Path walk-through in `docs/EXHIBITION_RUNBOOK_0415.md` §5 is the primary validation. This scaffold exists so that after the exhibition we can promote the path to CI-executed regression coverage without starting from zero.
