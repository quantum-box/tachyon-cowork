# Workspace IA

## 目的

Tachyon Cowork の情報設計では、ユーザーの作業文脈を `Workspace` として扱う。

これまで UI や資料で使っていた `作業ディレクトリ` は、PC で Workspace に紐づけられるローカルフォルダを指す言葉として整理し直す。ユーザー向けの主語は `Workspace` に統一する。

## 決定

`Workspace` は会話、指示、成果物、必要に応じたローカルフォルダ連携を束ねる作業文脈の単位とする。

ローカルフォルダは Workspace の必須条件ではない。PC ではフォルダを紐づけるとファイル検索、整理、容量分析、`AGENTS.md` 同期、ローカル MCP ツールの前提指定が便利になる。一方で、Web や mobile ではフォルダ未連携の Workspace でもチャットや指示、成果物管理を使える状態を目指す。

```text
Workspace
├─ Name
├─ Chats
├─ Workspace Instructions
├─ Artifacts / Canvas
└─ Linked Folder (optional)
   ├─ Local file tools
   ├─ AGENTS.md sync
   └─ Project-relative tool context
```

## 用語

| 用語 | 意味 | UI での扱い |
|------|------|-------------|
| Workspace | 作業文脈の箱。会話、指示、成果物、任意のフォルダ連携を束ねる | 主語として使う |
| Linked Folder | PC で Workspace に紐づけるローカルフォルダ | `このPCのフォルダ` と説明してよい |
| Workspace Instructions | Workspace 固有の agent 指示 | `AGENTS.md` と同期できる |
| Global Instructions | すべての Workspace に共通する指示 | 設定に置く |
| Files / Tools | ファイル検索、整理、重複検出、容量分析など | Linked Folder があると強くなる機能 |
| Artifact / Canvas | 生成物とプレビュー編集面 | Workspace の成果物として扱う |

避けたい表現:

- `作業ディレクトリ一覧`
- `Project`
- `Work Folder`
- `フォルダを開く` を Workspace 作成や Workspace 選択の意味で使うこと

使いたい表現:

- `Workspace`
- `Workspace一覧`
- `Workspaceを作成`
- `Workspaceを開く`
- `フォルダを紐づける`
- `フォルダ未連携`
- `このPCのフォルダに連携済み`

## IA 方針

### Workspace-first / Chat-centered

体験の中心は引き続きチャットに置く。ただし、チャットは常に何らかの Workspace 文脈の中で使うものとして整理する。

```text
App
├─ Workspace switcher
├─ Chat
│  ├─ Sessions
│  ├─ Attachments
│  └─ Realtime Voice
├─ Workspace
│  ├─ Overview
│  ├─ Instructions
│  ├─ Linked Folder
│  ├─ Related Chats
│  └─ Files / Tools
├─ Artifacts / Canvas
└─ Settings
   ├─ Account
   ├─ Model / Agent behavior
   ├─ MCP
   ├─ Appearance
   └─ Shortcuts / Voice
```

### Linked Folder は能力拡張

Workspace の identity はフォルダパスではなく Workspace 自身に持たせる。フォルダは任意の能力拡張として扱う。

PC でフォルダ連携がある場合:

- ファイルツールの初期ディレクトリになる
- agent に相対パスの基準として渡せる
- `AGENTS.md` を Workspace Instructions と同期できる
- ローカルファイル参照や生成物保存の UX が自然になる

フォルダ未連携の場合:

- チャットは開始できる
- Workspace Instructions は保存できる
- Artifact / Canvas は Workspace の成果物として扱える
- ファイルツールはフォルダ選択を促す

## 現状整理

現在の実装は `作業ディレクトリ` を Workspace に近いものとして扱っている。

- UI ではサイドバー上部に `作業ディレクトリ一覧` がある
- ルートは `/work-folders` と `/work-folders/:folderPath`
- Tauri 側の状態は `active_project` と `recent_projects`
- `ProjectEntry` は `path` を identity としている
- `AGENTS.md` と `.agent/` は選択中フォルダ直下に作られる
- チャットセッションとフォルダの紐づきは localStorage の `tachyon-cowork-session-projects` で補完している

この状態は PC ローカル中心の MVP としては自然だが、Web/mobile やフォルダ未連携 Workspace へ広げるには、Workspace と Linked Folder を分離する必要がある。

## 目標モデル

将来的には Workspace を独立した概念として持ち、Linked Folder は任意属性にする。

```ts
type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  instructions?: string;
  linkedFolderPath?: string;
  artifactIds?: string[];
};

type ChatSession = {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
};
```

実装上のポイント:

- session は `project_path` ではなく `workspace_id` に紐づく
- `linkedFolderPath` は null を許容する
- Workspace Instructions はフォルダ未連携でも保存できる
- PC で Linked Folder がある場合のみ、`AGENTS.md` 同期を有効にする
- 既存の folder path ベース履歴は移行レイヤーで Workspace に変換する

## 画面別の整理

### サイドバー

現在の `作業ディレクトリ一覧` は `Workspace` に変更する。

表示例:

```text
Workspace
  tachyon-cowork
  moverent
  フォルダ未連携の企画メモ

ファイルツール

チャット履歴
```

サイドバーではフォルダパスを主役にしすぎない。必要なら小さく `このPCのフォルダに連携済み` を出す。

### Workspace 詳細

Workspace 詳細画面は以下を持つ。

- Workspace 名
- Linked Folder の状態
- Workspace Instructions
- この Workspace のチャット
- ファイルツールへの導線

状態表示:

```text
フォルダ未連携
この Workspace はチャットと指示だけで利用できます。
PC のフォルダを紐づけると、ファイル検索や AGENTS.md 同期が使えます。
```

```text
このPCのフォルダに連携済み
/Users/example/project
```

### ファイルツール

`ファイルツール` はトップレベルに残してよいが、説明は Linked Folder 前提に寄せる。

- Linked Folder がある Workspace では、そのフォルダを初期値にする
- Linked Folder がない Workspace では、フォルダ選択を促す
- オフライン時は `ローカルファイルツール` として使える

### 設定

設定は Workspace の外側にある全体設定として扱う。

- Global Instructions
- デフォルトモデル
- ループ数
- MCP
- 表示
- ショートカット
- 音声
- アカウント

Workspace Instructions は設定ではなく Workspace 詳細に置く。

## 段階移行

### Phase 1: UI 文言の統一

- `作業ディレクトリ` を `Workspace` に置換する
- フォルダ操作の文脈だけ `フォルダを紐づける` と表現する
- README とヘルプの説明を Workspace 中心に直す
- `/work-folders` の内部ルートは一旦そのままでもよい

### Phase 2: Workspace と Linked Folder のモデル分離

- `ProjectEntry` 相当を `WorkspaceEntry` に置き換える
- `path` identity から `workspaceId` identity に移行する
- `linkedFolderPath` を optional にする
- フォルダ未連携 Workspace 作成を可能にする

### Phase 3: セッション紐づけの正式化

- localStorage の `sessionId -> project_path` ではなく、API または永続 store で `sessionId -> workspaceId` を持つ
- Workspace 詳細の `この Workspace のチャット` を正式データから表示する
- 別端末や Web/mobile でも Workspace とセッションが崩れない状態にする

### Phase 4: Artifact の Workspace 化

- Artifact / Canvas の成果物を Workspace に紐づける
- 右ペインの一時表示だけでなく、Workspace 詳細から再オープンできるようにする
- 生成物保存時に Linked Folder があれば保存先候補として使う

## コピー指針

### 初回利用

```text
Workspaceを作成
まず作業の文脈を作ります。PC では後からこの Workspace にフォルダを紐づけられます。
```

### フォルダ未連携

```text
フォルダ未連携
チャットと Workspace Instructions はこのまま使えます。
このPCのフォルダを紐づけると、ファイル検索や AGENTS.md 同期が利用できます。
```

### フォルダ連携済み

```text
このPCのフォルダに連携済み
このフォルダを基準にファイルツールとローカル操作を実行します。
```

### ファイルツール

```text
ファイルツール
Linked Folder または選択したフォルダを対象に、検索、整理、重複検出、容量分析を実行します。
```

## 未決事項

- Workspace を API 側の正式リソースにするか、当面 Tauri store に持つか
- Workspace Instructions をサーバー同期するか、ローカル優先にするか
- `AGENTS.md` と Workspace Instructions が競合した場合の優先順位
- Artifact 履歴をどの粒度で Workspace に保存するか
- 既存 `/work-folders` ルートをいつ `/workspaces` に移行するか
