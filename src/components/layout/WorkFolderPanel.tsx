import { ArrowLeft, FolderOpen, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";
import type { SessionSummary } from "../../lib/types";
import type { ProjectContext, ProjectEntry } from "../../lib/tauri-bridge";

type Props = {
  onBack: () => void;
  onStartChat: () => void;
  onPickProject: () => void;
  activeProject?: ProjectEntry | null;
  projectContext?: ProjectContext | null;
  sessions: SessionSummary[];
  isLoading?: boolean;
  isSaving?: boolean;
  error?: string | null;
  onSaveCustomInstructions: (customInstructions: string) => void;
  onOpenSession: (sessionId: string) => void;
};

export function WorkFolderPanel({
  onBack,
  onStartChat,
  onPickProject,
  activeProject,
  projectContext,
  sessions,
  isLoading = false,
  isSaving = false,
  error,
  onSaveCustomInstructions,
  onOpenSession,
}: Props) {
  const [customInstructions, setCustomInstructions] = useState("");

  useEffect(() => {
    setCustomInstructions(projectContext?.custom_instructions ?? "");
  }, [projectContext?.custom_instructions]);

  return (
    <div className="flex h-full flex-col bg-transparent transition-colors duration-150">
      <div className="border-b border-stone-200/80 bg-white/55 px-4 py-3 backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/25">
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
            <div className="notion-label mb-1">Workspace</div>
            <h2 className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
              作業ディレクトリ
            </h2>
            <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
              Workspace のファイルと agent 設定です
            </p>
          </div>
          <button
            type="button"
            onClick={onPickProject}
            className="notion-button relative z-10 shrink-0 px-3 py-1.5 text-xs"
          >
            別のフォルダを開く
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
          <section className="rounded-[24px] border border-stone-200/80 bg-white/80 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] dark:border-stone-800 dark:bg-stone-900/60">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-stone-100 p-2 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                <FolderOpen size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-stone-800 dark:text-stone-100">
                  {activeProject?.name ?? "未選択"}
                </div>
                <div className="mt-1 break-all text-xs text-stone-500 dark:text-stone-400">
                  {activeProject?.path ?? "作業ディレクトリを選択してください"}
                </div>
                <div className="mt-3 space-y-2 text-xs text-stone-500 dark:text-stone-400">
                  <div>
                    {projectContext?.workspace_path
                      ? "この Workspace を基準に会話とファイル作業を進めます"
                      : isLoading
                        ? "この Workspace を読み込み中..."
                        : "この Workspace に合わせて会話とファイル作業を進めます"}
                  </div>
                  <div className="rounded-2xl bg-stone-50/80 px-3 py-3 dark:bg-stone-950/40">
                    <div className="font-medium text-stone-700 dark:text-stone-200">
                      Custom Instructions
                    </div>
                    <div className="mt-1 break-all">
                      {projectContext?.agents_path ??
                        "保存すると AGENTS.md を作成します"}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-stone-50/80 px-3 py-3 dark:bg-stone-950/40">
                    <div className="font-medium text-stone-700 dark:text-stone-200">
                      Agent Assets
                    </div>
                    <div className="mt-1 break-all">
                      {projectContext?.agent_dir ??
                        "将来の skill / prompt 資産は .agent/ に置きます"}
                    </div>
                    <div className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                      {projectContext?.has_agent_dir
                        ? ".agent/ は利用可能です"
                        : "まだ .agent/ は作成されていません"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <PencilLine
                size={15}
                className="text-stone-500 dark:text-stone-400"
              />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">
                Workspace Custom Instructions
              </h3>
            </div>
            <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
              この内容は workspace 直下の `AGENTS.md` と同期します。Global
              の指示より、この Workspace の指示が優先されます。
            </p>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="この Workspace 固有のルール、完了条件、禁止事項、期待する進め方を書く"
              className="notion-input min-h-[160px] w-full resize-y rounded-[22px] px-4 py-3 text-sm text-stone-700 outline-none dark:text-stone-200"
            />
            {error && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <FolderOpen
                size={15}
                className="text-stone-500 dark:text-stone-400"
              />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">
                この作業ディレクトリのチャット
              </h3>
            </div>
            {sessions.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-stone-200 px-4 py-5 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
                まだチャットはありません。`新しいチャット` から始められます。
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession(session.id)}
                    className="w-full rounded-[22px] border border-stone-200 bg-white/80 px-4 py-3 text-left transition-colors hover:bg-white dark:border-stone-800 dark:bg-stone-900/45 dark:hover:bg-stone-900/75"
                  >
                    <div className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                      {session.name || "新しいチャット"}
                    </div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      {new Date(session.created_at).toLocaleString("ja-JP")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="border-t border-stone-200/80 px-6 py-4 dark:border-stone-800/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <button
            type="button"
            onClick={onStartChat}
            disabled={!activeProject}
            className="notion-button px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            新しいチャット
          </button>
          <button
            type="button"
            onClick={() => onSaveCustomInstructions(customInstructions)}
            disabled={isSaving || !activeProject}
            className="notion-button notion-button-primary px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
