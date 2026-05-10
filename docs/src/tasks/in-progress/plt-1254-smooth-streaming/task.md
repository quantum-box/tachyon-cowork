# PLT-1254 Cowork smooth text streaming

Linear: https://linear.app/quantum-box/issue/PLT-1254
Priority: High / Status: In Progress

## 背景

Cowork の Agent chat は Agent API SSE (`event: say`) を受信しているが、UI上では
テキストがカクつく、または複数tokenがまとまって出る。iOS WKWebView / Tauri WebView
では React state batching、Markdown再parse、smooth scroll の連続実行が重なると
paint が詰まりやすい。

## 方針

- SSE の `say` chunk は event id が異なっても同一 assistant segment に連結する。
- text streaming chunk は `flushSync` 後に次 paint を待ち、同一read loop内で大量に
  batchされないようにする。
- streaming中のassistant messageはMarkdown parseを避け、plain textとして軽く描画する。
  完了後は従来通りMarkdown表示に戻す。
- loading中のauto-scrollは `smooth` ではなく `auto` にして、token描画とscroll animationが
  競合しないようにする。

## 進捗

- [x] `useAgentChat` の SSE chunk merge key を見直し
- [x] streaming text chunk の flush/painter yield を追加
- [x] streaming中の軽量plain text表示を追加
- [x] loading中scrollの挙動を調整
- [x] split token chunk の単体テストを追加
- [x] TypeScript / lint / test
- [ ] PR 作成
- [ ] CI pass
- [ ] main merge後 TestFlight upload 確認
- [ ] CPO 報告

## 検証メモ

- `npm run typecheck`: pass
- `npm run test -- src/hooks/__tests__/useAgentChat.tool-flow.test.ts`: pass (11 tests)
- `npm run lint`: pass with existing warnings in `src/App.tsx` and `src/components/chat/ChatSearch.tsx`
- `npm run build`: pass
- Browser smoke: `npm run dev -- --host 127.0.0.1` + Playwright open `http://127.0.0.1:1420/` confirmed the Cowork sign-in screen renders. Console error was only missing `favicon.ico` (404).
