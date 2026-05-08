---
name: tachyon-real-api-smoke
description: Use when verifying a Linear or GitHub issue fix that should be deployed to the Tachyon Agent API, especially billing/tool-result regressions. Checks Linear/GitHub deploy state, then drives the real Tachyon Cowork Tauri app against production API and inspects streamed agent chunks.
---

# Tachyon Real API Smoke

## Overview

This project skill verifies production Agent API behavior through the real
Tachyon Cowork Tauri app. Use it for requests like:

- "this Linear issue is done, check whether it is deployed and works"
- "Agent API billing/tool result issue should be fixed, verify in the app"
- "PLT-xxxx looks complete, test it from tachyon-cowork"

It combines:

- Linear issue status and attached PR discovery
- GitHub PR merge/deploy workflow checks
- Tauri WebDriver automation with `window.__tachyonTestBridge`
- real API smoke tests using `scripts/e2e/real-api-tool-use.mjs`

## Important project facts

- Production API is usually reached through stored app auth with `apiBaseUrl:
  /api`, which proxies to `https://api.n1.tachy.one`.
- The Tauri debug binary is:
  `src-tauri/target/debug/tachyon-cowork`
- The Vite dev server must be running on `http://127.0.0.1:1420/`.
- `tauri-wd` runs on `http://127.0.0.1:4444`.
- `tauri-wd` 0.1.3 can panic if the runner toggles test mode and reloads the
  page. Prepare and run the no-reload runner from this skill instead.
- A successful current tool flow may produce `tool_call` directly rather than
  `tool_call_pending`. Treat `tool_call` + `tool_result` + final `say` as a
  valid app-level success unless the issue specifically requires
  `tool_call_pending`.

## Workflow

### 1. Read the Linear issue

Use the Linear app to fetch the issue directly:

```text
issue:PLT-1204
```

Record:

- status and completed time
- attached GitHub PRs/issues
- expected acceptance criteria

### 2. Check GitHub merge and deploy state

For an attached PR:

```bash
gh pr view PR_NUMBER --repo quantum-box/tachyon-apps \
  --json state,mergedAt,headRefOid,baseRefOid,url,statusCheckRollup
```

Then check deploy workflows around the merged commit:

```bash
gh run list --repo quantum-box/tachyon-apps --limit 25 \
  --json databaseId,workflowName,displayTitle,event,headBranch,headSha,status,conclusion,createdAt,updatedAt,url |
  jq '.[] | select(.headSha=="MERGE_SHA" or (.displayTitle|test("PLT-1204|3770|billing";"i")))'
```

For Agent API/payment fixes, relevant production deploys have included:

- `Deploy Tachyon API ECS`
- `Deploy Tachyon Lambda`
- sometimes `Deploy Agent API (AgentCore)`

Do not assume a fix is deployed only because the PR is merged. Verify the
workflow status is `completed` and `success`.

### 3. Prepare the no-reload real API runner

Run the helper script from the repository root:

```bash
.codex/skills/tachyon-real-api-smoke/scripts/prepare-no-reload-runner.sh
```

It writes:

```text
/tmp/tachyon-real-api-tool-use-no-reload.mjs
```

The generated runner:

- skips the test-mode reload that can poison `tauri-wd`
- captures partial bridge state into the JSON report if chat completion times
  out

### 4. Start the app automation stack

Use separate long-running command sessions:

```bash
npm run dev
```

```bash
tauri-wd --port 4444 --log-level info
```

If stale processes exist, clean them first:

```bash
pkill -f 'tauri-wd --port 4444' || true
pkill -f 'src-tauri/target/debug/tachyon-cowork' || true
pkill -f 'node .*vite' || true
```

### 5. Run the tool smoke

Use the selected project root and require `tool_result`.

```bash
node /tmp/tachyon-real-api-tool-use-no-reload.mjs \
  --message 'このプロジェクトのルートディレクトリの一覧をローカルツールで確認して、最後に TOOL_FLOW_OK とだけ答えてください。' \
  --project '/Users/takanorifukuyama/git/github.com/quantum-box/tachyon-cowork' \
  --expect-chunk-type tool_result \
  --output /tmp/tachyon-cowork-agent-tool-smoke.json \
  --timeout-ms 180000
```

Success indicators:

- no `PAYMENT_REQUIRED`
- no `InternalServerError: Failed to resolve Stripe client`
- `summary.chunkCounts` includes `tool_result`
- `summary.assistantTexts` includes `TOOL_FLOW_OK`
- `finalState.error` is null

Useful summary command:

```bash
jq '{
  sessionId:.finalState.sessionId,
  selectedModel:.finalState.selectedModel,
  chunkCounts:.summary.chunkCounts,
  toolCalls:.summary.toolCalls,
  toolResultsCount:(.summary.toolResults|length),
  assistantTexts:.summary.assistantTexts,
  errors:(.finalState.chunks|map(select(.type=="error"))),
  failures:.failures
}' /tmp/tachyon-cowork-agent-tool-smoke.json
```

### 6. Run the no-tool smoke

This isolates billing preflight from client tool execution:

```bash
node /tmp/tachyon-real-api-tool-use-no-reload.mjs \
  --message 'Reply exactly: NO_TOOL_OK' \
  --output /tmp/tachyon-cowork-agent-no-tool-smoke.json \
  --timeout-ms 120000
```

Success indicators:

- `assistantTexts` includes `NO_TOOL_OK`
- `summary.chunkCounts` includes `say` and `usage`
- no `PAYMENT_REQUIRED`
- no stream error

### 7. Clean up

Stop long-running sessions or run:

```bash
pkill -f 'tauri-wd --port 4444' || true
pkill -f 'src-tauri/target/debug/tachyon-cowork' || true
pkill -f 'node .*vite' || true
```

## Reporting

In the final answer, include:

- Linear issue status and PR merge time
- deploy workflow names and success times
- smoke report paths
- session IDs
- observed chunk flow
- whether `PAYMENT_REQUIRED` or Stripe config errors appeared

Example:

```text
tool smoke session: as_xxx
flow: user -> tool_call -> usage -> tool_result -> say
final response: TOOL_FLOW_OK
errors: none
```

If only `tool_call_pending` is missing but `tool_result` and final `say`
exist, call that out as a runner expectation mismatch rather than app failure.

