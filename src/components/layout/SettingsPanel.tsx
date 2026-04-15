import { X, Keyboard, Palette, Bot, Info, LogOut, Puzzle } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { McpSettingsSection } from "./McpSettingsSection";
import type { SendKeyMode } from "../../hooks/useSendKey";
import type { ModelOption } from "../../lib/models";

type Theme = "light" | "dark" | "system";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  selectedModel: string;
  modelOptions: ModelOption[];
  onModelChange: (model: string) => void;
  onLogout: () => void;
  apiBaseUrl?: string;
  tenantId?: string;
  onMcpConfigChanged?: () => void;
  sendKey: SendKeyMode;
  onSendKeyChange: (mode: SendKeyMode) => void;
  globalCustomInstructions: string;
  onGlobalCustomInstructionsChange: (value: string) => void;
};

function getShortcuts(sendKey: SendKeyMode) {
  return [
    { key: "Ctrl + N", description: "新しいチャット" },
    { key: "Ctrl + F", description: "チャット内検索" },
    { key: "Escape", description: "パネルを閉じる" },
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

export function SettingsPanel({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  selectedModel,
  modelOptions,
  onModelChange,
  onLogout,
  apiBaseUrl,
  tenantId,
  onMcpConfigChanged,
  sendKey,
  onSendKeyChange,
  globalCustomInstructions,
  onGlobalCustomInstructionsChange,
}: Props) {
  if (!isOpen) return null;

  const shortcuts = getShortcuts(sendKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="surface-panel relative mx-4 w-full max-w-lg overflow-hidden rounded-[28px] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200/80 px-6 py-4 dark:border-stone-800/80">
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            設定
          </h2>
          <button onClick={onClose} className="notion-icon-button p-1.5">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
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
                Global Custom Instructions
              </h3>
            </div>
            <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
              ここに書いた内容は、すべての Workspace に共通で適用されます。Workspace
              側の `AGENTS.md` に書いた内容がある場合は、そちらを優先します。
            </p>
            <textarea
              value={globalCustomInstructions}
              onChange={(e) =>
                onGlobalCustomInstructionsChange(e.target.value)
              }
              placeholder="常に守ってほしい指示、話し方、出力ルールを書く"
              className="notion-input min-h-[144px] w-full resize-y rounded-[22px] px-4 py-3 text-sm text-stone-700 outline-none dark:text-stone-200"
            />
            <div className="mt-2 text-[11px] text-stone-400 dark:text-stone-500">
              変更は自動保存されます
            </div>
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
              <div className="flex items-center justify-between">
                <span className="text-stone-500 dark:text-stone-400">
                  テナントID
                </span>
                <span className="max-w-[200px] truncate text-xs font-mono text-stone-700 dark:text-stone-300">
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
