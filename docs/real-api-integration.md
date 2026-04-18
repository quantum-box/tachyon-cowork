# Real API Integration Test

Tauri の debug app を WebDriver で起動し、real API に対して実際にメッセージを送りつつ、debug 用の test bridge から `chunks` や `tool_call` 系データを取得するための手順です。

## 目的

- UI の見た目だけでなく、`tool_call` `tool_call_pending` `tool_result` を JSON で検証する
- mock API ではなく real API で再現する
- macOS の native Tauri app を対象にする

## 前提

- `npm run dev` が起動している
- debug binary が存在する
  - 例: `src-tauri/target/debug/tachyon-cowork`
- `tauri-wd` がインストール済み
  - `cargo install tauri-webdriver-automation --locked`

## WebDriver 起動

```bash
tauri-wd --port 4444 --log-level debug
```

## 必須環境変数

```bash
export TACHYON_E2E_API_BASE_URL="https://api.n1.tachy.one"
export TACHYON_E2E_ACCESS_TOKEN="..."
export TACHYON_E2E_TENANT_ID="tn_xxx"
```

必要なら追加:

```bash
export TACHYON_E2E_USER_ID="user_xxx"
export TACHYON_E2E_REFRESH_TOKEN="..."
```

すでにアプリへ sign-in 済みなら、上の env を省略して保存済み auth を再利用しても動きます。

## 実行例

```bash
npm run test:e2e:real-api -- \
  --message "このワークスペースを調べて、必要ならツールを使って答えて" \
  --project "/absolute/path/to/workspace" \
  --expect-chunk-type tool_call_pending \
  --output /tmp/tachyon-real-api-report.json
```

特定のツールが使われたか確認したい場合:

```bash
npm run test:e2e:real-api -- \
  --message "このディレクトリの一覧を確認して" \
  --project "/absolute/path/to/workspace" \
  --expect-tool local_list_directory
```

## 何が取れるか

出力 JSON には次が含まれます。

- `finalState.chunks`
- `summary.chunkCounts`
- `summary.toolCalls`
- `summary.toolResults`
- `summary.assistantTexts`
- `finalState.error`

つまり、UI に出ていない途中経過も WebDriver 経由で読めます。

## test bridge について

- `window.__tachyonTestBridge` を使います
- 通常は無効です
- WebDriver スクリプトが `localStorage["__tachyon_test_mode"] = "1"` を入れてリロードすると有効になります
- debug 用なので、real API の integration test 目的以外では使わない想定です
