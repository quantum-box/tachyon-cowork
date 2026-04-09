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

## このブランチで入っている強化

- 作業ディレクトリ一覧画面を追加
- アクティブな作業ディレクトリごとのチャット導線を追加
- project context の初期化と要約保存を追加
- Tauri 側で project state を保持し、許可するファイルスコープを同期
- `projects/_template` と project/workspace 運用ガイドを追加

## 技術スタック

- Frontend: React 19, TypeScript, Vite
- Desktop shell: Tauri 2
- Backend: Rust
- Styling: Tailwind CSS 4
- Testing: Vitest

## セットアップ

### 前提

- Node.js 20 以上
- npm
- Rust stable
- Tauri CLI v2

```bash
cargo install tauri-cli --version "^2"
```

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
npm run typecheck
npm run test
npm run lint
```

Rust 側を含めたビルド確認は `cargo tauri dev` または `cargo tauri build` を使います。

## 作業ディレクトリ機能

このアプリでは、会話とファイル操作の前提を「作業ディレクトリ」単位で持てます。

### 何がうれしいか

- 案件ごとに参照するファイル範囲を切り替えられる
- そのフォルダでやりたいことを要約として保存できる
- project ごとの context を `.tachyon/` 配下に持てる
- 作業ディレクトリごとのチャット履歴を追いやすい

### 初回の流れ

1. アプリから作業ディレクトリを開く
2. 必要なら project context を初期化する
3. そのフォルダでやりたいことを要約として保存する
4. そのまま新しいチャットを始める

### project context の構成

初期化すると、対象ディレクトリ配下に次のような構成が作られます。

```text
.tachyon/
  project.json
  context/
    instructions.md
    glossary.md
    decisions.md
    todo.md
```

- `project.json`
  - project 名、summary、context の場所などを保持
- `context/instructions.md`
  - その project で守るべきルールや完了条件
- `context/glossary.md`
  - 用語集
- `context/decisions.md`
  - 判断理由や設計メモ
- `context/todo.md`
  - いま進めていること、次のアクション、詰まりどころ

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
```

## 関連ドキュメント

- [docs/project-workspace-guide.md](docs/project-workspace-guide.md)
- [docs/手動動作確認ガイド.md](docs/手動動作確認ガイド.md)
- [docs/tauri-webdriver.md](docs/tauri-webdriver.md)
- [projects/_template/README.md](projects/_template/README.md)

## 補足

- `tachyon-sdk` はプライベート依存のため、取得には GitHub アクセス権限が必要です
- 開発中は `VITE_COGNITO_REDIRECT_URI=http://localhost:1420/callback` を使います
- Tauri で動かしたときにのみ利用できる機能があります
