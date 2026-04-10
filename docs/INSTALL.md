# Tachyon Cowork インストール手順

## ダウンロード

最新版を GitHub Releases からダウンロード:
https://github.com/quantum-box/tachyon-cowork/releases/latest

| OS | ファイル |
|---|---|
| macOS (Apple Silicon) | `Tachyon-Cowork_*_aarch64.dmg` |
| macOS (Intel) | `Tachyon-Cowork_*_x64.dmg` |
| Windows | `Tachyon-Cowork_*_x64-setup.exe` または `.msi` |
| Linux | `.AppImage` または `.deb` |

> Apple Silicon (M1/M2/M3/M4) か Intel か分からない場合:  → メニュー > このMacについて > チップ を確認

---

## macOS

### インストール

1. `.dmg` ファイルをダウンロード
2. ダブルクリックで開く
3. `Tachyon Cowork.app` を `Applications` フォルダにドラッグ

### Gatekeeper 警告の回避

現在アプリは正式なコード署名がないため、初回起動時に警告が出る。

**方法 1: 右クリックから開く**
1. Finder で `Applications` > `Tachyon Cowork` を右クリック（または Control + クリック）
2. 「開く」を選択
3. 警告ダイアログで「開く」をクリック

**方法 2: システム設定から許可**
1. `Tachyon Cowork` をダブルクリック（ブロックされる）
2. システム設定 > プライバシーとセキュリティ
3. 「"Tachyon Cowork" は開発元を確認できないため、使用がブロックされました」の横にある「このまま開く」をクリック
4. パスワードを入力して許可

**方法 3: ターミナルから属性を削除**
```bash
xattr -cr /Applications/Tachyon\ Cowork.app
```

> 2 回目以降は通常通りダブルクリックで起動できる。

### アンインストール

`Applications` フォルダから `Tachyon Cowork.app` を削除。
設定データも削除する場合:
```bash
rm -rf ~/Library/Application\ Support/com.quantumbox.tachyon-cowork
```

---

## Windows

### インストール

**EXE (NSIS) インストーラー（推奨）:**
1. `.exe` ファイルをダウンロード
2. ダブルクリックで実行

**MSI インストーラー:**
1. `.msi` ファイルをダウンロード
2. ダブルクリックで実行

### SmartScreen 警告の回避

現在アプリは署名されていないため、SmartScreen 警告が表示される。

1. 「Windows によって PC が保護されました」ダイアログが表示される
2. 「詳細情報」をクリック
3. 「実行」をクリック

### アンインストール

設定 > アプリ > インストールされているアプリ から「Tachyon Cowork」をアンインストール。

---

## Linux

### AppImage

```bash
chmod +x Tachyon-Cowork_*.AppImage
./Tachyon-Cowork_*.AppImage
```

### Debian パッケージ

```bash
sudo dpkg -i tachyon-cowork_*.deb
```

---

## 初回セットアップ

### 1. ログイン

アプリ起動後、ログイン画面が表示される。
社内 OAuth 認証（Tachyon アカウント）でログインする。

### 2. API 接続確認

ログイン後、自動的に Tachyon API に接続される。
チャット画面が表示されれば接続成功。

### 3. Work Folder の設定（任意）

作業ディレクトリを「Work Folder」として登録すると、プロジェクトのコンテキストを AI に共有できる。
サイドバーの「フォルダを開く」からディレクトリを選択。

---

## アップデート

- アプリ内自動更新が有効（起動時にバックグラウンドで更新チェック）
- 更新がある場合、サイドバーに通知バナーが表示される
- クリックするとダウンロード → 自動再起動

> 自動更新が動作しない場合は、GitHub Releases から最新版を手動ダウンロードしてインストールし直す。

---

## トラブルシューティング

### アプリが起動しない

- **macOS**: Gatekeeper 警告の回避手順（上記）を確認
- **Windows**: SmartScreen 警告の回避手順（上記）を確認
- **Linux**: `chmod +x` で実行権限を付与しているか確認

### ログインできない

- ネットワーク接続を確認
- VPN 接続が必要な場合は接続しているか確認
- ブラウザのポップアップブロッカーが OAuth コールバックをブロックしていないか確認

### チャットが応答しない

- API サーバーの稼働状況を確認
- サイドバーの設定から AI モデルを変更して再試行
- アプリを再起動

### 自動更新が動作しない

- 署名鍵が正しく設定されているか確認（管理者向け）
- ネットワーク接続を確認
- GitHub Releases に最新版がアップロードされているか確認
- 手動で最新版をダウンロードしてインストールし直す
