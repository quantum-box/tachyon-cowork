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
    <div className="flex h-full flex-col bg-white transition-colors duration-150 dark:bg-slate-950">
      <div className="border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-3 px-6 py-4">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title="チャットに戻る"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              作業ディレクトリ
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              この作業ディレクトリの設定です
            </p>
          </div>
          <div className="ml-auto">
            <button
              type="button"
              onClick={onPickProject}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              別の作業ディレクトリを開く
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
          <section className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-white p-2 text-gray-600 dark:bg-slate-900 dark:text-slate-300">
                <FolderOpen size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {activeProject?.name ?? "未選択"}
                </div>
                <div className="mt-1 break-all text-xs text-gray-500 dark:text-slate-400">
                  {activeProject?.path ?? "作業ディレクトリを選択してください"}
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-slate-400">
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
                className="text-gray-500 dark:text-slate-400"
              />
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">
                この作業ディレクトリのチャット
              </h3>
            </div>
            {sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-xs text-gray-500 dark:border-slate-700 dark:text-slate-400">
                まだチャットはありません。`新しいチャット` から始められます。
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession(session.id)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:bg-slate-800"
                  >
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {session.name || "新しいチャット"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
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
                className="text-gray-500 dark:text-slate-400"
              />
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">
                このフォルダでやりたいこと
              </h3>
            </div>
            <p className="mb-3 text-xs text-gray-500 dark:text-slate-400">
              例:
              提案書を作る、営業資料を直す、議事録をまとめる、ファイル整理を進める
            </p>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="この作業ディレクトリで主に手伝ってほしいことを書く"
              className="min-h-[160px] w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
            {error && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="border-t border-gray-200 px-6 py-4 dark:border-slate-700">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <button
            type="button"
            onClick={onStartChat}
            disabled={!activeProject}
            className="rounded-lg border border-indigo-200 px-3 py-2 text-sm text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
          >
            新しいチャット
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={() => onSaveSummary(summary)}
              disabled={isSaving || !activeProject}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
