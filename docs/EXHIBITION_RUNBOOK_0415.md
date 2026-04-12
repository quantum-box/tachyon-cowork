# Exhibition 2026-04-15 — Operator Runbook (Unsigned Build)

> Audience: exhibition-PC operator.
> Goal: reproduce the CEO-approved Golden Path on the exhibition PC on 2026-04-15, using an **unsigned** build (Apple Developer / Windows EV certs not acquired).
> Companion: `docs/tasks/exhibition-0415.md` (internal task state), `~/knowledge/src/projects/tachyon-cowork/exhibition-checklist-0415.md` (strategy context).

Golden Path:

> 起動 → Cognito ログイン → 新プロジェクト作成 → 録音 → 議事録自動生成

## 1. Prerequisites on the exhibition PC

| # | Item | How to verify |
|---|---|---|
| 1 | Node.js ≥ 20 | `node -v` |
| 2 | Rust stable + `cargo` | `cargo --version` |
| 3 | Tauri CLI (`cargo tauri`) | `cargo tauri --version` — install via `cargo install tauri-cli --locked` if missing |
| 4 | Docker Desktop running | `docker version` |
| 5 | `python:3.12-slim` image | `docker pull python:3.12-slim` |
| 6 | microsandbox CLI (`msb`) | `curl -fsSL https://get.microsandbox.dev \| sh` then `msb --version` |
| 7 | `.env` present at repo root (OpenAI / Anthropic / Cognito keys) | `ls .env` — see §1a |
| 8 | Microphone permission granted for the app | §4 |
| 9 | Cloudflare / AWS network reachable | `curl -I https://cognito-idp.<region>.amazonaws.com/` (expect 400 JSON — means reachable) |

### 1a. Required `.env` keys

Tachyon Cowork (frontend) — `tachyon-cowork/.env`:

- `VITE_COGNITO_DOMAIN`
- `VITE_COGNITO_CLIENT_ID`
- `VITE_COGNITO_REDIRECT_URI`
- `VITE_COGNITO_SCOPES`
- `VITE_API_BASE_URL`
- `VITE_DEFAULT_TENANT_ID`

Agent API backend — `tachyon-apps/.env`:

- `OPENAI_API_KEY` (required — Whisper transcription + gpt-4o summarization + auto-name)
- `ANTHROPIC_API_KEY` **not required for the 4/15 Golden Path** (PdM-confirmed 2026-04-13). Leave blank.
- `COGNITO_JWK_URL`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`
- **Exhibition-only overrides** — add the following so auto-generated session / chatroom names use OpenAI instead of the Anthropic default (requires tachyon-apps PR #2293 merged):

  ```
  SESSION_NAME_GENERATION_MODEL=openai/gpt-4o-mini
  CHATROOM_NAME_GENERATION_MODEL=openai/gpt-4o-mini
  ```

  Without these overrides the feature silently degrades to first-message truncation — functional but visitor-visible as generic placeholder names.

Sanitize rule: never copy `.env` from production; use the exhibition-issued keys.

## 1b. Unsigned build — explicit risks

CEO has approved unsigned operation for 2026-04-15; these residual risks remain and must be understood by the operator:

| Risk | Impact | Mitigation on the day |
|---|---|---|
| First-run OS warning (Gatekeeper / SmartScreen) | Visitors see a security prompt mid-demo | Perform §3 bypass **before the exhibition opens**; never live-demo the first install |
| No notarization (macOS) | macOS may re-quarantine after Sequoia updates or file re-download | Keep the `.dmg` locally; do not re-download on the day. Re-run `xattr -cr` if re-copied |
| No EV cert (Windows) | SmartScreen "Unknown publisher" warning on every fresh user profile | Use a single pre-configured Windows user profile; don't switch accounts on the day |
| Updater is disabled (P0-2 hotfix) | No in-app updates during exhibition | Lock the installed build; any hotfix must be a manual re-install, not OTA |
| No code-signing integrity guarantee | If the `.dmg`/`.msi` is tampered with, nothing detects it | Build on a trusted engineer PC, transfer directly to exhibition PC (USB or SFTP); do not download via untrusted channels |
| Anti-virus may quarantine `.msi` | Windows may silently block execution | Disable AV scan for the install folder before first run |
| Browser download warnings | Chrome/Edge may block the `.dmg`/`.msi` download | Use `scp`/USB to transfer; avoid browser download for the installer |

## 2. Build (unsigned)

From `tachyon-cowork/` on the exhibition PC:

```bash
./scripts/build-internal.sh release
```

Expected artifacts:

- **macOS**: `src-tauri/target/release/bundle/dmg/Tachyon*.dmg` and `.../macos/TachyonCowork.app` (ad-hoc signed automatically by the script)
- **Windows**: `src-tauri/target/release/bundle/msi/*.msi` (unsigned — SmartScreen will warn)

If the build fails on Linux with `glib-2.0 not found`, install: `sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`. (Linux is not the exhibition target, but useful for a dev sanity check.)

## 3. Install & first-run bypass

### macOS (Gatekeeper)

1. Mount the `.dmg` and drag `TachyonCowork.app` into `/Applications`.
2. Strip the quarantine attribute:

   ```bash
   xattr -cr /Applications/TachyonCowork.app
   ```

3. Launch via Finder → right-click → Open (first run only). If still blocked: System Settings → Privacy & Security → "Open Anyway".
4. **Verify after macOS reboot**: the quarantine strip survives reboot, but re-downloaded copies re-apply the flag. Re-run `xattr -cr` if the app was re-downloaded.

### Windows (SmartScreen)

1. Double-click the `.msi`. SmartScreen shows "Windows protected your PC".
2. Click **詳細情報 (More info)** → **実行 (Run anyway)**.
3. Complete the installer.
4. On first launch, Windows Defender may re-prompt — allow once.

### Linux (AppImage / deb) — not the exhibition target

`chmod +x *.AppImage && ./Tachyon*.AppImage` — no signing system to bypass.

## 4. Microphone permission

- **macOS**: System Settings → Privacy & Security → Microphone → enable `TachyonCowork`. First recording attempt triggers the prompt; accept it.
- **Windows**: Settings → Privacy → Microphone → allow desktop apps, and allow `TachyonCowork` specifically.
- **Spare**: bring a USB mic in case the built-in mic fails to enumerate.

## 5. Golden Path walk-through (on exhibition PC)

1. Launch `TachyonCowork`.
2. Cognito login — use the exhibition test user (credentials on the printed card).
3. Create a new project named **展示会デモ**.
4. Start recording → speak ~30 s of Japanese → stop recording.
5. Wait for the transcript / minutes panel to populate automatically (Agent API pipeline).
6. Confirm the minutes render without errors.

### 3UC demo (optional, time-permitting)

| UC | Action | Fallback |
|---|---|---|
| UC2 (市場調査) | Chat: 「○○業界の最新トレンドを調査して」 → `web_search` tool auto-runs | none needed — external-dep-free |
| UC1 (パワポ作成) | Chat: 「調査結果をスライドにまとめて」 → `file_manager` tool emits `.pptx` | If `msb` unavailable, skip UC1 |
| UC3 (画像分類) | Drag-and-drop image into chat | Works offline; good fallback if network flaky |

## 5a. Post-deploy smoke: verify OpenAI auto-name override

Run this **once** on the exhibition PC after the runbook's §1a `.env` overrides are in place and the backend has picked them up (Agent API restart). Goal: confirm that `SESSION_NAME_GENERATION_MODEL=openai/gpt-4o-mini` is actually taking effect — otherwise auto-named sessions silently fall back to truncated first-message strings and visitors see generic placeholders.

Two equivalent checks — do at least one:

### Option 1 — UI smoke (1 min)

1. Launch the app → Cognito login (exhibition test user).
2. Create a new project; send a chat message like「明日の取締役会の議題を3つ提案して」.
3. Wait ~5 s, then look at the left-nav session title.
4. **PASS** = a natural-language title (e.g. 「取締役会議題の提案」). **FAIL** = the verbatim first ~20 chars of the message followed by `…`.

### Option 2 — curl smoke (requires API access)

Using the exhibition test user's access token and the Agent API base URL (from `VITE_API_BASE_URL`):

```bash
TOKEN="<cognito access token>"
API="<VITE_API_BASE_URL>"

# Create a session with a known prompt
SID=$(curl -s -X POST "$API/v1/sessions" \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"initial_message":"Quarterly review agenda draft"}' | jq -r .id)

# Trigger auto-name (or wait for the server-side post-message hook)
# then re-read the session
curl -s "$API/v1/sessions/$SID" \
  -H "authorization: Bearer $TOKEN" | jq -r .name
```

**PASS** = a short summary title different from the raw initial message. **FAIL** = the initial message itself (truncated).

### If FAIL

- Confirm `tachyon-apps/.env` contains both overrides and that the Agent API process was restarted after the edit (`docker compose restart tachyon-api` or equivalent).
- Confirm the deployed backend is at merge commit `76c7418` or later (tachyon-apps PR #2293).
- As a workaround, the demo is still functional — only the session title is affected.

## 6. Fallback & troubleshooting

| Symptom | Action |
|---|---|
| Gatekeeper still blocks after `xattr -cr` | Right-click → Open; if "Open Anyway" absent, re-download the `.dmg` and retry |
| SmartScreen won't let through on Windows | Try an Administrator PowerShell: `Unblock-File .\Tachyon*.msi` |
| White screen on launch | Already fixed in commit `6595598` (P0-1 hooks violation) — confirm the build is from `main` ≥ that commit |
| Auto-update prompt appears | Should not — updater disabled in P0-2. If seen, dismiss and file a bug; do **not** allow update |
| Cognito login loops | Verify `VITE_COGNITO_REDIRECT_URI` matches the Cognito app-client callback list exactly |
| Recording starts but no transcript | Verify Agent API reachable (`VITE_API_BASE_URL` ping) and `OPENAI_API_KEY` set in `tachyon-apps/.env` |
| UC1 `msb` pipeline fails | Skip UC1; narrate "UC1 preview only" and pivot to UC2 + recording + UC3 |
| Network flaky | Tether via phone; UC3 + local playback works offline |

## 7. Hand-off checklist (tick on exhibition PC before 2026-04-14 EOD)

- [ ] Unsigned build produced and installed on exhibition PC
- [ ] Gatekeeper / SmartScreen bypass performed and persists after PC reboot
- [ ] Cognito login with exhibition test user succeeds
- [ ] Golden Path 1 loop completes end-to-end (recording → minutes)
- [ ] §5a smoke: OpenAI auto-name override verified (session title is LLM-generated, not truncated raw message)
- [ ] UC2 tested (web search)
- [ ] UC1 tested or explicitly skipped (record decision)
- [ ] Spare USB mic on-hand
- [ ] Printed credential card prepared
