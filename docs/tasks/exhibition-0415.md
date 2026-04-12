---
task: Exhibition 2026-04-15 Golden Path unsigned build validation
owner: Takanori Fukuyama (account1)
branch: exhibition-0415
deadline: 2026-04-14 (day before exhibition)
status: in progress
---

# Exhibition 2026-04-15 Golden Path Validation

Ensure the unsigned build executes the Golden Path end-to-end on the exhibition PC on 2026-04-15.

Golden Path (CEO-approved):
起動 → Cognito ログイン → 新プロジェクト作成 → 録音 → 議事録自動生成

Related: `~/knowledge/src/projects/tachyon-cowork/exhibition-checklist-0415.md`

## Environment reality

Work is performed on a headless Linux VPS (Sakura). Consequences:

- macOS `.dmg` / Windows `.msi` cannot be produced here — exhibition PC validation is documentation-driven, handed off via runbook.
- Linux unsigned build (`.deb` / `.AppImage`) via `scripts/build-internal.sh release` is produced here as a smoke check of the build pipeline.
- Golden Path GUI walk-through cannot be driven from this host without a display server; Tauri WebDriver automation is scaffolded but full execution requires the exhibition PC (macOS WKWebView bridge documented in `docs/tauri-webdriver.md`).

## Approach (Plan A — agreed 2026-04-13)

1. Worktree + taskdoc (this file). ✅
2. Background `scripts/build-internal.sh release` on Linux — smoke-verify pipeline. In progress.
3. Exhibition-PC prerequisite setup/check: microsandbox CLI, Docker `python:3.12-slim`, `.env` API keys.
4. Gatekeeper / SmartScreen bypass runbook (hand-off artifact for exhibition-PC operator).
5. Tauri WebDriver Golden Path automation — scaffold script; full run on exhibition PC.
6. PR to `main`, CI green, admin merge.
7. Report progress to PdM (`work:pdm-pf`) at each milestone.

Plan B (macOS CI runner for signed build artifact) is parked — requires PdM/COO approval and is not on the critical path for unsigned exhibition use.

## Environment audit (2026-04-13, this VPS)

| Item | Status | Notes |
|---|---|---|
| Node | v22.22.0 | ≥ 20 required ✅ |
| Rust / cargo | 1.93.1 | ✅ |
| Docker | 29.2.1 | ✅ |
| `python:3.12-slim` image | pulled | ✅ |
| microsandbox (`msb`) | v0.2.6 installed to `~/.local/bin` | ✅ |
| `tachyon-cowork/.env` | present | `VITE_COGNITO_*`, `VITE_API_BASE_URL`, `VITE_DEFAULT_TENANT_ID` set |
| `tachyon-apps/.env` | present | `OPENAI_API_KEY` set; **`ANTHROPIC_API_KEY` not set** (flag to PdM — is it required for 4/15 Golden Path?) |

## Deliverables

- [ ] `docs/EXHIBITION_RUNBOOK_0415.md` — exhibition-PC operator runbook (build / install / bypass / Golden Path / fallback)
- [ ] `scripts/e2e/golden-path.spec.ts` (or equivalent) — Tauri WebDriver skeleton
- [ ] Linux unsigned build artifact smoke-check result logged here
- [ ] PR to `main`, CI green

## Open questions for PdM

- Is `ANTHROPIC_API_KEY` needed for the 4/15 Golden Path, or is OpenAI-only sufficient?
- Cognito exhibition test user: credentials confirmed? (checklist item ⬜)
- Mic permission / spare USB mic: who procures?

## Build / QA log

### 2026-04-13 Linux unsigned build smoke check

`scripts/build-internal.sh release` on this VPS → **failed at `cargo tauri build`** with:

```
pkg-config exited with status code 1
The system library `glib-2.0` required by crate `glib-sys` was not found.
```

System deps (`glib-2.0`, `webkit2gtk-4.1`, etc.) are not installed on this Sakura VPS and require `sudo apt-get install` which is outside this session's scope. Decision: **de-scope Linux build from exhibition critical path** — exhibition targets are macOS `.dmg` and Windows `.msi`, produced on the operator's own PC per the runbook. Pipeline correctness through `npm run build` + `tsc --noEmit` + `vite build` passed successfully before the Rust step, so the front-end portion is validated.

Front-end result (from build log):
- `npm install` ✅ (549 packages, 8 high-severity audit warnings — pre-existing)
- `tsc --noEmit` ✅
- `vite build` ✅
- `cargo tauri build` ❌ (Linux system deps, see above)

