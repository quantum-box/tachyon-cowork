# Project Workspace Guide

このリポジトリでは、作業対象ごとの文脈を安定させるために Workspace ごとの agent 指示と補助資産を持てるようにします。

## ねらい

- 作業ディレクトリを切り替えるだけで、対象 workspace の前提に入れる
- workspace 固有の指示を `AGENTS.md` で管理する
- agent skill を `.agent/skills` などで管理できる
- 人間にもエージェントにも読みやすい最小構成にする

## 推奨構成

```text
projects/
  _template/
    README.md
    context/
      instructions.md
      glossary.md
      decisions.md
      todo.md
    workspace/
      .gitkeep
```

## 各ファイルの役割

- `README.md`
  - その project の目的、関連コード、起点になる資料
- `context/instructions.md`
  - project 固有の作法、禁止事項、完了条件
- `context/glossary.md`
  - 用語、略語、登場人物、外部サービス名
- `context/decisions.md`
  - なぜその設計や運用を選んだかの記録
- `context/todo.md`
  - 今の論点、次アクション、保留事項
- `workspace/`
  - その project で使う作業用ディレクトリ
  - 生成物や一時ファイルを置く場所として使える

## Agent Skills

連携フォルダに次のいずれかのディレクトリがある場合、Cowork は直下の
`*/SKILL.md` を agent skill として検出します。

- `.agent/skills`
- `.codex/skills`
- `.claude/skills`
- `.agents/skills`

`SKILL.md` は YAML frontmatter で `name` と `description` を持つ必要があります。
`name` は小文字英数字とハイフンのみ、`description` は agent がいつ使うべきかを判断できる文章にします。

```markdown
---
name: release-check
description: Use when preparing or verifying a Tachyon Cowork release.
---

# Release Check

Follow the release verification workflow...
```

Cowork は常時コンテキストには `name`、`description`、`SKILL.md` のパスだけを渡します。作業内容が一致したとき、agent は client tool で `SKILL.md` 本文を読み、必要な補助ファイルだけを追加で読みます。

## 運用ルール

1. 新しい作業テーマを切るときは、`projects/_template` を複製して project を作る
2. project ごとに「コードの置き場」と「文脈ファイル」を `README.md` に書く
3. 継続中の判断は `decisions.md` に短く追記する
4. セッションごとのメモは `todo.md` に寄せる
5. 共通ルールはルートに置き、project 固有ルールだけを `context/instructions.md` に書く

## このリポジトリでの使い方

このリポジトリ自体は単一アプリ構成です。なので最初はアプリ本体を分割せず、運用コンテキストだけを `projects/` に切り出すのが安全です。

例えば次のように使えます。

- `projects/product-core/`
  - アプリ本体の開発方針、画面仕様、判断ログ
- `projects/qa-and-verification/`
  - 手動確認観点、既知の不具合、再現手順
- `projects/release-ops/`
  - 配布、ビルド、リリース時の手順や注意点

必要になったら後から project を増やせば十分です。最初から細かく分けすぎないのが運用しやすいです。
