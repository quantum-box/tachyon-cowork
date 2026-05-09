import {
  ArrowLeft,
  Keyboard,
  Palette,
  Bot,
  Info,
  LogOut,
  Puzzle,
  Mic,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { McpSettingsSection } from "./McpSettingsSection";
import type { SendKeyMode } from "../../hooks/useSendKey";
import type { ModelOption } from "../../lib/models";

type Theme = "light" | "dark" | "system";

type Props = {
  onBack: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  selectedModel: string;
  modelOptions: ModelOption[];
  onModelChange: (model: string) => void;
  onLogout: () => void;
  apiBaseUrl?: string;
  tenantId?: string;
  onMcpConfigChanged?: () => void;
  showMcpSettings?: boolean;
  sendKey: SendKeyMode;
  onSendKeyChange: (mode: SendKeyMode) => void;
  realtimeVoiceEnabled: boolean;
  onRealtimeVoiceEnabledChange: (enabled: boolean) => void;
  globalCustomInstructions: string;
  onGlobalCustomInstructionsChange: (value: string) => void;
  maxRequests: number;
  onMaxRequestsChange: (value: number) => void;
};

function getShortcuts(sendKey: SendKeyMode) {
  return [
    { key: "Ctrl + N", description: "新しいチャット" },
    { key: "Ctrl + F", description: "チャット内検索" },
    { key: "Escape", description: "検索を閉じる" },
    {
      key: sendKey === "cmd-enter" ? "⌘/Ctrl + Enter" : "Enter",
      description: "メッセージ送信",
    },
    {
      key: sendKey === "cmd-enter" ? "Enter" : "Shift + Enter",
      description: "改行",
    },
  ];
}

export function SettingsPage({
  onBack,
  theme,
  onThemeChange,
  selectedModel,
  modelOptions,
  onModelChange,
  onLogout,
  apiBaseUrl,
  tenantId,
  onMcpConfigChanged,
  showMcpSettings = true,
  sendKey,
  onSendKeyChange,
  realtimeVoiceEnabled,
  onRealtimeVoiceEnabledChange,
  globalCustomInstructions,
  onGlobalCustomInstructionsChange,
  maxRequests,
  onMaxRequestsChange,
}: Props) {
  const shortcuts = getShortcuts(sendKey);

  return (
    <div className="flex h-full flex-col bg-transparent transition-colors duration-150">
      <div className="border-b border-stone-200/80 bg-white/55 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/25">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="notion-icon-button relative z-10 p-2"
            title="チャットに戻る"
          >
            <ArrowLeft size={18} />
          </button>
          <div
            className="titlebar-safe-header min-w-0 flex-1"
            data-tauri-drag-region
          >
            <div className="notion-label mb-1">設定</div>
            <h2 className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
              設定
            </h2>
            <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
              表示、モデル、ショートカット、MCP、アカウント
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {/* Theme */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Palette
                size={14}
                className="text-stone-500 dark:text-stone-400"
              />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                テーマ
              </h3>
            </div>
            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          </section>

          {/* Default Model */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Bot size={14} className="text-stone-500 dark:text-stone-400" />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                デフォルトモデル
              </h3>
            </div>
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="notion-input w-full rounded-2xl px-3 py-2 text-sm"
            >
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Bot size={14} className="text-stone-500 dark:text-stone-400" />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                ループ数
              </h3>
            </div>
            <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
              Agent loop の最大反復回数です。調査や複数ファイル操作では大きめの値が必要になる場合があります。
            </p>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={maxRequests}
              onChange={(e) =>
                onMaxRequestsChange(e.currentTarget.valueAsNumber)
              }
              className="notion-input w-full rounded-2xl px-3 py-2 text-sm"
            />
            <div className="mt-2 text-[11px] text-stone-400 dark:text-stone-500">
              1〜100 の範囲で自動保存されます
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Bot size={14} className="text-stone-500 dark:text-stone-400" />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                共通指示
              </h3>
            </div>
            <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
              ここに書いた内容は、すべてのワークスペース
              に共通で適用されます。ワークスペース側の `AGENTS.md`
              に書いた内容がある場合は、そちらを優先します。
            </p>
            <textarea
              value={globalCustomInstructions}
              onChange={(e) => onGlobalCustomInstructionsChange(e.target.value)}
              placeholder="常に守ってほしい指示、話し方、出力ルールを書く"
              className="notion-input min-h-[144px] w-full resize-y rounded-[22px] px-4 py-3 text-sm text-stone-700 outline-none dark:text-stone-200"
            />
            <div className="mt-2 text-[11px] text-stone-400 dark:text-stone-500">
              変更は自動保存されます
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Mic size={14} className="text-stone-500 dark:text-stone-400" />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                音声会話
              </h3>
            </div>
            <label className="notion-input flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2.5">
              <span className="min-w-0 text-sm text-stone-700 dark:text-stone-200">
                チャット画面にマイクボタンを表示
              </span>
              <input
                type="checkbox"
                checked={realtimeVoiceEnabled}
                onChange={(e) => onRealtimeVoiceEnabledChange(e.target.checked)}
                className="h-4 w-4 accent-stone-900 dark:accent-stone-100"
              />
            </label>
          </section>

          {/* Send Key Mode */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Keyboard
                size={14}
                className="text-stone-500 dark:text-stone-400"
              />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                メッセージ送信キー
              </h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onSendKeyChange("enter")}
                className={`flex-1 rounded-2xl border px-3 py-2 text-sm transition-colors ${
                  sendKey === "enter"
                    ? "border-stone-300 bg-white text-stone-900 shadow-sm dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                    : "border-stone-200 text-stone-600 hover:bg-white/80 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-900"
                }`}
              >
                Enter
              </button>
              <button
                onClick={() => onSendKeyChange("cmd-enter")}
                className={`flex-1 rounded-2xl border px-3 py-2 text-sm transition-colors ${
                  sendKey === "cmd-enter"
                    ? "border-stone-300 bg-white text-stone-900 shadow-sm dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                    : "border-stone-200 text-stone-600 hover:bg-white/80 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-900"
                }`}
              >
                ⌘/Ctrl + Enter
              </button>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Keyboard
                size={14}
                className="text-stone-500 dark:text-stone-400"
              />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                キーボードショートカット
              </h3>
            </div>
            <div className="space-y-2">
              {shortcuts.map((s) => (
                <div
                  key={s.description}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-stone-600 dark:text-stone-400">
                    {s.description}
                  </span>
                  <kbd className="rounded-lg border border-stone-200 bg-white/80 px-2 py-0.5 text-xs font-mono text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          {/* MCP Servers */}
          {showMcpSettings && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Puzzle
                  size={14}
                  className="text-stone-500 dark:text-stone-400"
                />
                <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                  MCP Servers
                </h3>
              </div>
              <McpSettingsSection onConfigChanged={onMcpConfigChanged} />
            </section>
          )}

          {/* Account */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-stone-500 dark:text-stone-400" />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                アカウント
              </h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-stone-500 dark:text-stone-400">
                  API URL
                </span>
                <span className="max-w-[200px] truncate text-xs font-mono text-stone-700 dark:text-stone-300">
                  {apiBaseUrl || "-"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-stone-500 dark:text-stone-400">
                  テナントID
                </span>
                <span className="max-w-[320px] break-all text-right text-xs font-mono text-stone-700 dark:text-stone-300">
                  {tenantId || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500 dark:text-stone-400">
                  バージョン
                </span>
                <span className="text-xs font-mono text-stone-700 dark:text-stone-300">
                  0.1.0
                </span>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
            >
              <LogOut size={14} />
              ログアウト
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
