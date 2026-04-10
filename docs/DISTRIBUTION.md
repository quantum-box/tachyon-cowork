# Tachyon Cowork 配布フロー

## 概要

Tachyon Cowork は GitHub Releases を通じて社内配布する。
初回のみ手動インストールが必要だが、以降は Tauri の自動更新機能により最新版が自動適用される。

## リリースフロー

```
tag push (v*) → GitHub Actions → ビルド (macOS/Windows/Linux) → GitHub Release 公開
```

### 手順

1. `src-tauri/tauri.conf.json` の `version` を更新
2. `package.json` の `version` も合わせて更新
3. コミット & タグ作成:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
4. GitHub Actions (`tauri-release.yml`) が自動起動
5. 4 プラットフォームで並列ビルド:
   - macOS ARM64 (Apple Silicon)
   - macOS x86_64 (Intel)
   - Windows x86_64
   - Linux x86_64
6. ビルド成果物が GitHub Release に公開される
7. `latest.json` が自動生成され、自動更新の配信元となる

### 手動トリガー

GitHub Actions の `workflow_dispatch` からも実行可能。バージョンタグを入力して手動ビルドできる。

## 成果物一覧

| プラットフォーム | ファイル形式 | 用途 |
|---|---|---|
| macOS ARM64 | `.dmg`, `.app.tar.gz` | インストーラー / 自動更新用 |
| macOS x86_64 | `.dmg`, `.app.tar.gz` | インストーラー / 自動更新用 |
| Windows | `.msi`, `.exe` (NSIS) | インストーラー |
| Linux | `.AppImage`, `.deb` | ポータブル / Debian パッケージ |

各リリースには `checksums-sha256.txt` が含まれる。

## 自動更新 (Auto-Update)

PR#39 で Tauri Updater プラグインを導入済み。

- **エンドポイント**: `https://github.com/quantum-box/tachyon-cowork/releases/latest/download/latest.json`
- **動作**: アプリ起動 5 秒後にバックグラウンドで更新チェック → 更新があればアプリ内バナーで通知 → ユーザー操作でダウンロード & 再起動
- **署名検証**: `TAURI_SIGNING_PRIVATE_KEY` で署名、アプリ内蔵の公開鍵で検証

### 必要な GitHub Secrets

| Secret | 説明 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri 更新署名用の秘密鍵 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 秘密鍵のパスワード |

鍵生成:
```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/tachyon-cowork.key
```
生成された公開鍵を `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に設定する。

> **現状**: `pubkey` がプレースホルダー (`REPLACE_WITH_TAURI_SIGNING_PUBLIC_KEY`) のため、
> 署名鍵を生成して設定するまで自動更新は機能しない。

## コード署名

### 現状 (PLT-147 未完了)

- **macOS**: Ad-hoc 署名のみ（CI で `codesign --force --deep -s -`）
  - Apple Developer 証明書による正式署名は未実装
  - ユーザーは初回起動時に Gatekeeper 警告を手動で回避する必要がある
- **Windows**: 署名なし
  - SmartScreen 警告が表示される

### 正式署名の導入 (PLT-147)

正式なコード署名を導入する場合:
- macOS: Apple Developer Program に加入し、Developer ID Application 証明書を取得
- Windows: EV コード署名証明書を取得
- CI に証明書を GitHub Secrets として登録

## 配布先

- GitHub Releases: https://github.com/quantum-box/tachyon-cowork/releases
- 社内 Slack チャンネルでリリース通知を共有
