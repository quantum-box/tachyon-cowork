---
name: tauri-hmr-verify
description: Use when you need to verify UI changes in the running Tauri app with HMR (Hot Module Replacement). Triggers include requests to check how a component looks, test a feature end-to-end in the native app, take screenshots of the Tauri app, or verify that a code change works in the actual desktop app. This skill combines `cargo tauri dev` (HMR) with WebDriver automation to inspect and interact with the live app.
---

# Tauri HMR動作確認スキル

## Overview

`cargo tauri dev` でHMR付きのTauriアプリを起動し、WebDriverで自動操作・スクリーンショット・DOM検証を行う。コード変更が即座に反映されるため、UIの反復的な確認に最適。

## When to use

- コード変更後にTauriアプリ上での見た目・動作を確認したいとき
- スクリーンショットを撮ってUIの確認をしたいとき
- DOM状態やReactコンポーネントの描画結果を検証したいとき
- `agent-browser`ではTauriネイティブウィンドウを操作できないとき

## Prerequisites

- `tauri-plugin-webdriver-automation` がdebugビルドで有効（本プロジェクトは設定済み）
- `tauri-wd` CLIがインストール済み (`cargo install tauri-webdriver-automation --locked`)

## Workflow

### 1. Tauriアプリをdev起動

```bash
npx tauri dev 2>&1 &
```

バックグラウンドで起動。ViteのHMRとRustのコンパイルが走る。

### 2. WebDriverポートを確認

ログから `[webdriver] listening on port NNNNN` を探す。初回はRustのコンパイルに時間がかかる。

```bash
# ログを監視してポートを待つ
for i in $(seq 1 60); do
  if grep -q "webdriver" /path/to/output.log 2>/dev/null; then
    grep "webdriver" /path/to/output.log
    break
  fi
  sleep 5
done
```

### 3. tauri-wdブリッジを起動

```bash
tauri-wd --port 4444 &
sleep 1
curl -s http://127.0.0.1:4444/status
```

### 4. WebDriverセッション作成

```bash
SESSION_ID=$(curl -s -X POST http://127.0.0.1:4444/session \
  -H 'Content-Type: application/json' \
  -d '{
    "capabilities": {
      "alwaysMatch": {
        "tauri:options": {
          "binary": "./src-tauri/target/debug/tachyon-cowork"
        }
      }
    }
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['value']['sessionId'])")
```

注意: `tauri dev` で既にアプリが起動している場合、tauri-wdは新しいプロセスを起動する。既存のプロセスとは別になる。

### 5. ウィンドウリサイズ

```bash
curl -s -X POST http://127.0.0.1:4444/session/$SESSION_ID/window/rect \
  -H 'Content-Type: application/json' \
  -d '{"width":1400,"height":900}'
```

### 6. スクリーンショット撮影

```bash
curl -s http://127.0.0.1:4444/session/$SESSION_ID/screenshot | python3 -c "
import sys,json,base64
d=json.load(sys.stdin); img=base64.b64decode(d['value'])
open('/tmp/tauri-screenshot.png','wb').write(img)
print(f'Saved {len(img)} bytes')
"
```

撮影後、Readツールでpngファイルを読んで確認する。

### 7. JavaScript実行

React内部やDOMの状態を確認するには `execute/sync` を使う。

JSONエスケープの問題を避けるため、**python3でペイロードを構築する**のが安定する:

```bash
python3 << 'PYEOF'
import json, subprocess

sid = "YOUR_SESSION_ID"
script = """
// ここにJavaScriptを書く
var title = document.title;
return title;
"""

payload = json.dumps({"script": script, "args": []})
result = subprocess.run(
    ["curl", "-s", "-X", "POST",
     f"http://127.0.0.1:4444/session/{sid}/execute/sync",
     "-H", "Content-Type: application/json",
     "-d", payload],
    capture_output=True, text=True
)
print(result.stdout)
PYEOF
```

### 8. 要素クリック

```bash
# 要素を探す
ELEMENT_ID=$(curl -s -X POST http://127.0.0.1:4444/session/$SESSION_ID/elements \
  -H 'Content-Type: application/json' \
  -d '{"using":"css selector","value":"button[aria-label]"}' \
  | python3 -c "import sys,json; els=json.load(sys.stdin)['value']; print(els[0]['element-6066-11e4-a52e-4f735466cecf'])")

# クリック
curl -s -X POST http://127.0.0.1:4444/session/$SESSION_ID/element/$ELEMENT_ID/click \
  -H 'Content-Type: application/json' -d '{}'
```

### 9. HMRの活用

コードを変更すると自動的にフロントエンドがリロードされる。WebDriverセッションは維持される。

- フロントエンド（TypeScript/React）の変更: 数秒で反映
- Rust側の変更: 再コンパイルが走る（数十秒〜数分）

HMR後にページが再読込された場合、localStorageの状態（認証情報など）は維持される。

### 10. クリーンアップ

```bash
curl -s -X DELETE http://127.0.0.1:4444/session/$SESSION_ID
pkill -f tauri-wd
pkill -f "target/debug/tachyon-cowork"
```

## Tips

- **認証バイパス**: テスト用に `localStorage` に偽の認証情報を注入できる
- **テストフック**: devモードで `window.__testXxx` のような関数を一時的に公開し、WebDriverの `execute/sync` から呼び出すと便利
- **スクリーンショットの確認**: `/tmp/` に保存してReadツールで画像を表示する
- **JSONエスケープ**: curlで直接JSONを書くとエスケープ地獄になる。python3の `json.dumps` を使うこと

## Common pitfalls

- `tauri dev` と `tauri-wd` のセッション作成で2つのアプリプロセスが起動する場合がある。WebDriverで操作するのはtauri-wdが起動した方
- HMRリロード後は `window.__testXxx` のようなdevフックが再登録されるまで一瞬使えなくなる。sleepを入れること
- WKWebViewのsandboxed iframe内では外部CDNスクリプトの読み込みが失敗することがある。親ページのReactを直接使う方が安定する
