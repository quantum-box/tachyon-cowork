# Tachyon Cowork

Tachyon Cowork は、Tauri + React で作られたデスクトップ向けの AI アシスタントです。チャット、ファイル操作、MCP ツール、成果物生成を 1 つの画面にまとめつつ、作業ディレクトリごとの文脈を切り替えながら仕事を進められます。

## できること

- AI チャット
  - ストリーミング応答、セッション履歴、ピン留め、検索に対応
- ファイルを前提にした作業
  - PDF / DOCX / XLSX / PPTX / テキスト系ファイルを添付して要約や相談ができる
- ファイルツール
  - 検索、整理プラン、重複検出、容量分析などをローカル環境で扱える
- Artifact / Canvas
  - AI が生成したコードや文書をアプリ内で確認し、そのまま保存できる
- MCP 連携
  - Built-in app や外部 MCP サーバーのツールを会話から呼び出せる
- 作業ディレクトリ切り替え
  - 顧客別、案件別、テーマ別に作業フォルダを切り替え、文脈を分離できる

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| Frontend | React 19, TypeScript, Vite |
| Desktop shell | Tauri 2 |
| Backend | Rust |
| Styling | Tailwind CSS 4 |
| Testing | Vitest |

## セットアップ

### 前提条件

| ツール | バージョン | 確認コマンド |
|--------|-----------|-------------|
| Node.js | 20 以上 | `node -v` |
| npm | 10 以上 | `npm -v` |
| Rust | stable | `rustc --version` |
| Tauri CLI v2 | 2.x | `cargo tauri --version` |

Tauri CLI が未インストールの場合:

```bash
cargo install tauri-cli --version "^2"
```

### Rust ツールチェーンの準備

```bash
# Rust 未インストールの場合
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

### OS 別の追加依存

<details>
<summary>macOS</summary>

Xcode Command Line Tools が必要です:

```bash
xcode-select --install
```

</details>

<details>
<summary>Linux (Ubuntu / Debian)</summary>

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  libgtk-3-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev
```

</details>

<details>
<summary>Windows</summary>

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) をインストール
- WebView2 は Windows 10/11 に標準搭載済み

</details>

### GitHub アクセス設定

`tachyon-sdk` はプライベートリポジトリのため、Cargo が GitHub からクレートを取得できるよう認証設定が必要です。

```bash
# ~/.cargo/config.toml に追加（未作成なら新規作成）
[net]
git-fetch-with-cli = true
```

GitHub CLI または SSH 鍵で `github.com` にアクセスできる状態にしてください。

### インストール

```bash
git clone https://github.com/quantum-box/tachyon-cowork.git
cd tachyon-cowork
npm install
cp .env.example .env
```

`.env` には OAuth / API 接続先を設定します。開発時の既定値は `.env.example` をそのまま使えます。

### 開発起動

```bash
cargo tauri dev
```

フロントエンドだけ確認したい場合:

```bash
npm run dev
```

### 主な検証コマンド

```bash
npm run typecheck   # TypeScript 型チェック
npm run test        # フロントエンドテスト
npm run lint        # ESLint
npm run format:check  # Prettier フォーマット確認
```

## ビルド

### リリースビルド（署名あり）

```bash
cargo tauri build
```

### 社内配布用ビルド（署名なし）

コード署名なしでビルドする場合は、同梱のスクリプトを使います:

```bash
./scripts/build-internal.sh
```

ビルド成果物は `src-tauri/target/release/bundle/` 以下に出力されます。

| OS | 成果物 |
|----|--------|
| macOS | `.dmg` (`bundle/dmg/`) および `.app` (`bundle/macos/`) |
| Windows | `.msi` / `.exe` (`bundle/nsis/` or `bundle/msi/`) |
| Linux | `.AppImage` / `.deb` (`bundle/appimage/` or `bundle/deb/`) |

## インストール手順（社内配布）

### macOS

署名なしバイナリのため、macOS Gatekeeper のブロックを解除する必要があります。

#### DMG の場合

1. `.dmg` を開き、`Tachyon Cowork.app` を `/Applications` にドラッグ
2. **初回起動前に**ターミナルで以下を実行:

```bash
xattr -cr /Applications/Tachyon\ Cowork.app
```

3. アプリを起動

#### 「開発元が未確認」ダイアログが出た場合

「システム設定 > プライバシーとセキュリティ」から「このまま開く」を選択するか、上記の `xattr -cr` コマンドを実行してください。

### Windows

1. `.msi` または `.exe` をダブルクリック
2. SmartScreen の警告が出た場合: 「詳細情報」→「実行」を選択

### Linux

```bash
# AppImage の場合
chmod +x Tachyon-Cowork_*.AppImage
./Tachyon-Cowork_*.AppImage

# deb パッケージの場合
sudo dpkg -i tachyon-cowork_*.deb
```

## 設定

### 環境変数

`.env` ファイルで以下を設定します（詳細は `.env.example` 参照）:

| 変数 | 説明 |
|------|------|
| `VITE_COGNITO_DOMAIN` | Cognito 認証エンドポイント |
| `VITE_COGNITO_CLIENT_ID` | OAuth2 クライアント ID |
| `VITE_COGNITO_REDIRECT_URI` | OAuth2 コールバック URI |
| `VITE_COGNITO_SCOPES` | OAuth スコープ |
| `VITE_API_BASE_URL` | バックエンド API エンドポイント |
| `VITE_DEFAULT_TENANT_ID` | デフォルトテナント ID |

### アプリ内設定

- **テーマ**: ダーク / ライトモード切り替え
- **送信キー**: Cmd+Enter / Ctrl+Enter の選択
- **MCP サーバー**: 外部 MCP サーバーの追加・管理

## 作業ディレクトリ機能

このアプリでは、会話とファイル操作の前提を「作業ディレクトリ」単位で持てます。

### 何がうれしいか

- 案件ごとに参照するファイル範囲を切り替えられる
- `AGENTS.md` で workspace ごとの custom instructions を持てる
- 将来の agent 資産を `.agent/` 配下にまとめられる
- 作業ディレクトリごとのチャット履歴を追いやすい

### 初回の流れ

1. アプリから作業ディレクトリを開く
2. 必要なら設定画面で Global Custom Instructions を書く
3. Workspace ごとの指示は `AGENTS.md` と同期して保存する
4. そのまま新しいチャットを始める

### Workspace の agent 関連ファイル

workspace では、agent 向けの情報を次のように扱います。

```text
AGENTS.md
.agent/
```

- `AGENTS.md` — その workspace 固有の custom instructions
- `.agent/` — 将来の skills / prompts / templates など agent 資産置き場
- 生成ファイルや通常のドキュメントは `.agent/` ではなく、通常の workspace 配下に置く

## `projects/` ディレクトリ

このリポジトリには、project 単位の運用テンプレートも含めています。

```text
projects/
  _template/
    README.md
    context/
    workspace/
```

アプリそのもののコードとは別に、作業テーマごとのメモや運用ルールを切り出したいときに使います。詳しくは [docs/project-workspace-guide.md](docs/project-workspace-guide.md) を参照してください。

## ディレクトリ構成

```text
src/          React フロントエンド
src-tauri/    Tauri / Rust バックエンド
docs/         運用ガイド、動作確認手順
projects/     project workspace テンプレート
scripts/      ビルド・ユーティリティスクリプト
```

## 既知の制限事項

- **コード署名**: 現在コード署名は未実装です（PLT-147）。社内配布時は各 OS のセキュリティ警告を手動で回避する必要があります
- **自動アップデート**: 署名なしバイナリでは Tauri の自動アップデート機能は利用できません。新バージョンは手動で再インストールしてください
- **tachyon-sdk**: プライベート依存のため、ビルドには GitHub へのアクセス権限が必要です
- **CSP**: Content Security Policy は開発中のため無効化されています
- **オフラインモード**: API サーバーに接続できない場合、チャット機能は制限されます。ファイルツール（検索・整理・重複検出）はオフラインでも動作します
- **MCP サーバー**: 外部 MCP サーバーの利用には別途サーバーのセットアップが必要です

## トラブルシューティング

### ビルドエラー: tachyon-sdk の取得に失敗する

GitHub への認証を確認してください:

```bash
ssh -T git@github.com   # SSH の場合
gh auth status           # GitHub CLI の場合
```

### macOS で「壊れているため開けません」と表示される

```bash
xattr -cr /Applications/Tachyon\ Cowork.app
```

### Linux でシステムライブラリが見つからない

「OS 別の追加依存」セクションのパッケージをインストールしてください。

## 関連ドキュメント

- [docs/project-workspace-guide.md](docs/project-workspace-guide.md) — Project workspace 運用ガイド
- [docs/手動動作確認ガイド.md](docs/手動動作確認ガイド.md) — 手動 QA テスト手順
- [docs/business-usecases.md](docs/business-usecases.md) — ビジネスユースケース
- [docs/tauri-webdriver.md](docs/tauri-webdriver.md) — WebDriver 自動テスト
- [docs/release-notes-v0.1.0.md](docs/release-notes-v0.1.0.md) — v0.1.0 リリースノート
- [projects/_template/README.md](projects/_template/README.md) — Project テンプレート
