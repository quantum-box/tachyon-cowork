# 利用状況トラッキング設計

## 目的

KR3「週 5 日使用」の達成度を計測するため、アプリの利用状況を収集する。

## データポイント

### 1. 起動 Ping

アプリ起動時に Tachyon API へ ping を送信する。

```
POST /v1/telemetry/ping
Content-Type: application/json
Authorization: Bearer <user_token>

{
  "app": "tachyon-cowork",
  "version": "0.1.0",
  "platform": "darwin-aarch64",
  "event": "app_start",
  "timestamp": "2026-04-11T09:00:00Z"
}
```

レスポンス:
```
200 OK
{ "ok": true }
```

### 2. セッション終了

アプリ終了時（またはウィンドウ非表示から一定時間後）にセッション時間を送信する。

```
POST /v1/telemetry/ping
Authorization: Bearer <user_token>

{
  "app": "tachyon-cowork",
  "version": "0.1.0",
  "platform": "darwin-aarch64",
  "event": "app_session",
  "timestamp": "2026-04-11T17:30:00Z",
  "data": {
    "session_duration_sec": 30600,
    "messages_sent": 42
  }
}
```

### 3. フィードバック送信

フィードバックボタン経由の送信イベント。

```
POST /v1/telemetry/ping
Authorization: Bearer <user_token>

{
  "app": "tachyon-cowork",
  "event": "feedback_sent",
  "timestamp": "2026-04-11T12:00:00Z"
}
```

## フロントエンド実装方針

### 起動 Ping

`App.tsx` または認証完了後のエントリポイントで 1 回だけ送信:

```typescript
async function sendTelemetryPing(event: string, data?: Record<string, unknown>) {
  try {
    const token = getAuthToken();
    await fetch(`${API_BASE_URL}/v1/telemetry/ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        app: "tachyon-cowork",
        version: APP_VERSION,
        platform: getPlatformString(),
        event,
        timestamp: new Date().toISOString(),
        ...(data && { data }),
      }),
    });
  } catch {
    // テレメトリ失敗はサイレントに無視（UX をブロックしない）
  }
}
```

### セッション時間計測

- アプリ起動時に `sessionStart = Date.now()` を記録
- `beforeunload` イベントまたは Tauri の `close-requested` イベントで経過時間を計算して送信
- `navigator.sendBeacon` を使用してページ離脱時でも確実に送信

## KR3「週 5 日使用」の判定方法

### 定義

- 「使用」= その日に `app_start` イベントが 1 回以上記録されている
- 「週 5 日使用」= 月〜金のうち 5 日間で `app_start` が記録されている週
- 対象ユーザー: 社内配布先の全メンバー

### サーバー側集計クエリ（概念）

```sql
-- 週ごとのアクティブ日数（ユーザー別）
SELECT
  user_id,
  DATE_TRUNC('week', timestamp) AS week,
  COUNT(DISTINCT DATE(timestamp)) AS active_days
FROM telemetry_events
WHERE app = 'tachyon-cowork'
  AND event = 'app_start'
GROUP BY user_id, DATE_TRUNC('week', timestamp);

-- KR3 達成判定: active_days >= 5 のユーザー数 / 全対象ユーザー数
```

### ダッシュボード指標

| 指標 | 説明 |
|---|---|
| DAU | 日次アクティブユーザー数 |
| WAU | 週次アクティブユーザー数 |
| 週 5 日使用率 | `active_days >= 5` のユーザー割合 |
| 平均セッション時間 | `app_session` の `session_duration_sec` 平均 |
| フィードバック数 | `feedback_sent` イベント数 |

## プライバシー

- 収集するのは利用状況のみ（起動、セッション時間、メッセージ数）
- チャット内容や入力テキストは収集しない
- 社内利用のためオプトアウトは設けない（社内ポリシーに従う）
- データは Tachyon API サーバーに保存、社外への送信なし

## 実装優先度

1. **P0**: 起動 Ping（KR3 計測の最低要件）
2. **P1**: セッション時間計測
3. **P2**: フィードバック送信イベント
4. **P2**: ダッシュボード構築
