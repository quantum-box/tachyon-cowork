import { X, Keyboard, Palette, Bot, Info, LogOut, Puzzle } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { McpSettingsSection } from "./McpSettingsSection";

type Theme = "light" | "dark" | "system";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onLogout: () => void;
  apiBaseUrl?: string;
  tenantId?: string;
  onMcpConfigChanged?: () => void;
};

const MODELS = [
  { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-opus-4", label: "Claude Opus 4" },
  { id: "anthropic/claude-haiku-3-5", label: "Claude Haiku 3.5" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

const SHORTCUTS = [
  { key: "Ctrl + N", description: "新しいチャット" },
  { key: "Ctrl + F", description: "チャット内検索" },
  { key: "Escape", description: "パネルを閉じる" },
  { key: "Enter", description: "メッセージ送信" },
  { key: "Shift + Enter", description: "改行" },
];

export function SettingsPanel({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  selectedModel,
  onModelChange,
  onLogout,
  apiBaseUrl,
  tenantId,
  onMcpConfigChanged,
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">設定</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Theme */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Palette size={14} className="text-gray-500 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">テーマ</h3>
            </div>
            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          </section>

          {/* Default Model */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Bot size={14} className="text-gray-500 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                デフォルトモデル
              </h3>
            </div>
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Keyboard size={14} className="text-gray-500 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                キーボードショートカット
              </h3>
            </div>
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.key} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{s.description}</span>
                  <kbd className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 text-xs font-mono border border-gray-200 dark:border-slate-600">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          {/* MCP Servers */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Puzzle size={14} className="text-gray-500 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">MCP Servers</h3>
            </div>
            <McpSettingsSection onConfigChanged={onMcpConfigChanged} />
          </section>

          {/* Account */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-gray-500 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">アカウント</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">API URL</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs font-mono truncate max-w-[200px]">
                  {apiBaseUrl || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">テナントID</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs font-mono truncate max-w-[200px]">
                  {tenantId || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">バージョン</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs font-mono">0.1.0</span>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
