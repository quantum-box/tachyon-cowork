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
  onSaveSummary: (summary: string) => void;
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
  onSaveSummary,
  onOpenSession,
}: Props) {
  const [summary, setSummary] = useState("");

  useEffect(() => {
    setSummary(projectContext?.summary ?? "");
  }, [projectContext?.summary]);

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
              この作業ディレクトリの設定です
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
                <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                  {projectContext?.workspace_path
                    ? "選択したフォルダ直下で作業します"
                    : isLoading
                      ? "このフォルダ向けの準備中..."
                      : "このフォルダに合わせて会話とファイル作業を進めます"}
                </div>
              </div>
            </div>
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

          <section>
            <div className="mb-3 flex items-center gap-2">
              <PencilLine
                size={15}
                className="text-stone-500 dark:text-stone-400"
              />
              <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">
                このフォルダでやりたいこと
              </h3>
            </div>
            <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
              例:
              提案書を作る、営業資料を直す、議事録をまとめる、ファイル整理を進める
            </p>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="この作業ディレクトリで主に手伝ってほしいことを書く"
              className="notion-input min-h-[160px] w-full resize-y rounded-[22px] px-4 py-3 text-sm text-stone-700 outline-none dark:text-stone-200"
            />
            {error && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                {error}
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
            onClick={() => onSaveSummary(summary)}
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
