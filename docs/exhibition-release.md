# 展示会向けリリースドラフト手順

2026-04-15 の展示会に向けて、Tachyon Cowork の unsigned ビルドを自PC展示用に切り出す手順。

## 前提

- コード署名は **見送り**（Apple Developer / Windows EV cert 未取得）
- macOS は ad-hoc 署名、Windows は unsigned
- エンドユーザー向け Gatekeeper / SmartScreen 回避手順は [INSTALL.md](./INSTALL.md) を参照
- 将来 Developer ID 証明書を取得した場合は、repo Secrets に以下を追加するだけで自動的に本署名ビルドに切り替わる（`.github/workflows/tauri-release.yml` に guard 組み込み済み）
  - `APPLE_CERTIFICATE`
  - `APPLE_CERTIFICATE_PASSWORD`
  - `APPLE_SIGNING_IDENTITY`
  - `APPLE_ID`
  - `APPLE_PASSWORD`
  - `APPLE_TEAM_ID`

## 手順

### 1. バージョン更新

- `src-tauri/tauri.conf.json` の `version` を `0.3.0` に更新
- `package.json` の `version` を合わせる
- `src-tauri/Cargo.toml` の version も同期

### 2. リリースノート準備

`docs/release-notes-v0.3.0.md` を作成し、v0.2.0 からの主要変更点を列挙する。

### 3. タグ push

```bash
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json docs/release-notes-v0.3.0.md
git commit -m "chore: bump to v0.3.0 for exhibition"
git tag -a v0.3.0 -m "Exhibition release 2026-04-15"
git push origin main
git push origin v0.3.0
```

### 4. Actions でのビルド確認

- <https://github.com/quantum-box/tachyon-cowork/actions>
- `Tauri Release` workflow がタグ push で起動することを確認
- 4 プラットフォーム並列ビルド完了まで待機（目安 20〜30 分）
- 失敗したジョブは actions ログから原因を特定

### 5. Release 成果物検証

<https://github.com/quantum-box/tachyon-cowork/releases/tag/v0.3.0> に以下が揃っていることを確認:

- `Tachyon-Cowork_0.3.0_aarch64.dmg`（macOS ARM64）
- `Tachyon-Cowork_0.3.0_x64.dmg`（macOS Intel）
- `Tachyon-Cowork_0.3.0_x64-setup.exe`（Windows NSIS）
- `Tachyon-Cowork_0.3.0_x64_en-US.msi`（Windows MSI）
- `checksums-sha256.txt`
- `latest.json`（自動更新 manifest）

### 6. 展示 PC への導入

1. 上記 release から macOS ARM64 / Windows x64 を展示 PC にダウンロード
2. macOS: Finder で右クリック → 「開く」で初回 Gatekeeper 警告を通過
3. Windows: SmartScreen → 「詳細情報」→「実行」
4. 起動後 30 分の放置テスト（メモリリーク・クラッシュが無いこと）
5. ネットワーク断 → 復帰の挙動確認
6. 主要機能（ログイン / チャット / プロジェクトフォルダ / MCP）をスモーク

### 7. draft release 運用（任意）

初回アップロードを draft にして社内レビュー後に公開したい場合:

```bash
gh release edit v0.3.0 --draft=true
# 確認後
gh release edit v0.3.0 --draft=false
```

## 手動再ビルド

タグが既に push 済みで再ビルドが必要な場合:

1. GitHub Actions → `Tauri Release` → Run workflow
2. Branch: `main`
3. Version: `v0.3.0`
4. Run workflow

workflow_dispatch は同一タグに対して artifact を上書きする。

## トラブルシューティング

- **macOS ビルドで `codesign` が失敗する**
  - secrets 未設定時は ad-hoc 署名のみ（`codesign -s -`）のため失敗しないはず
  - `APPLE_CERTIFICATE` が部分的にだけ設定されていると tauri-action 側で不整合が起きる。全部設定するか全部外すかにする
- **Windows ビルドで SmartScreen が強く警告する**
  - 本署名 cert を取得するまで回避運用（[INSTALL.md](./INSTALL.md#smartscreen-警告の回避) 参照）
- **`latest.json` の署名検証エラー**
  - `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` が secrets に設定されているか確認（自動更新用で Apple signing とは別）
  - `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` がプレースホルダー (`REPLACE_WITH_TAURI_SIGNING_PUBLIC_KEY`) のままだと自動更新は機能しない

## 関連ドキュメント

- [DISTRIBUTION.md](./DISTRIBUTION.md) — 通常の配布フロー
- [INSTALL.md](./INSTALL.md) — エンドユーザー向けインストール手順（Gatekeeper / SmartScreen 回避）
- `.github/workflows/tauri-release.yml` — ビルド & リリース workflow 本体
