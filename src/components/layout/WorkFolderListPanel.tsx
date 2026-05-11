import {
  ArrowLeft,
  Check,
  FolderOpen,
  Link2,
  MessageSquarePlus,
  Plus,
  X,
} from "lucide-react";
import { useState } from "react";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import type { ProjectEntry } from "../../lib/tauri-bridge";

type Props = {
  onBack: () => void;
  onStartChat: () => void;
  onPickProject: () => void;
  recentProjects: ProjectEntry[];
  activeProject?: ProjectEntry | null;
  isLoading?: boolean;
  onOpenProject: (path: string) => void;
  onRemoveProject: (path: string) => void;
};

export function WorkFolderListPanel({
  onBack,
  onStartChat,
  onPickProject,
  recentProjects,
  activeProject,
  isLoading = false,
  onOpenProject,
  onRemoveProject,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const handleWindowDrag = useWindowDrag();
  const projects = activeProject
    ? [
        activeProject,
        ...recentProjects.filter(
          (project) => project.path !== activeProject.path,
        ),
      ]
    : recentProjects;

  return (
    <div className="flex h-full flex-col bg-transparent transition-colors duration-150">
      <div className="border-b border-stone-200/80 bg-white/55 px-4 py-3 backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/25">
        <div className="flex items-center gap-3" onMouseDown={handleWindowDrag}>
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
            <div className="notion-label mb-1">ワークスペース</div>
            <h2 className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
              {showCreate ? "ワークスペース作成" : "ワークスペース一覧"}
            </h2>
            <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
              {showCreate
                ? "フォルダなしで始めるか、このPCのフォルダを紐づけます"
                : "切り替える・このPCのフォルダ連携を管理する"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={showCreate}
            className="notion-button notion-button-primary relative z-10 shrink-0 px-3 py-1.5 text-xs font-medium"
          >
            <Plus size={14} />
            新規
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4">
          {showCreate ? (
            <div className="rounded-[22px] border border-stone-200/80 bg-white/72 px-5 py-5 dark:border-stone-800 dark:bg-stone-900/40">
              <div className="text-sm font-medium text-stone-800 dark:text-stone-100">
                新しいワークスペース
              </div>
              <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                まずはフォルダなしでチャットを始められます。PCのファイルを扱いたくなったら、このワークスペースにフォルダを紐づけます。
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onStartChat}
                  className="rounded-[20px] border border-stone-200 bg-white/80 px-4 py-4 text-left transition-colors hover:bg-white dark:border-stone-800 dark:bg-stone-950/30 dark:hover:bg-stone-900/70"
                >
                  <MessageSquarePlus
                    size={18}
                    className="text-stone-500 dark:text-stone-400"
                  />
                  <div className="mt-3 text-sm font-medium text-stone-800 dark:text-stone-100">
                    フォルダなしで始める
                  </div>
                  <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                    会話とワークスペース指示から始めます。
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onPickProject}
                  className="rounded-[20px] border border-stone-200 bg-white/80 px-4 py-4 text-left transition-colors hover:bg-white dark:border-stone-800 dark:bg-stone-950/30 dark:hover:bg-stone-900/70"
                >
                  <Link2
                    size={18}
                    className="text-stone-500 dark:text-stone-400"
                  />
                  <div className="mt-3 text-sm font-medium text-stone-800 dark:text-stone-100">
                    このPCのフォルダを紐づける
                  </div>
                  <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                    ファイル検索や AGENTS.md 同期を使えます。
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="notion-button mt-4 px-3 py-2 text-xs"
              >
                一覧へ戻る
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-stone-200 px-6 py-10 text-center dark:border-stone-800">
              <div className="text-sm font-medium text-stone-800 dark:text-stone-100">
                フォルダ連携済みワークスペースはまだありません
              </div>
              <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                フォルダ未連携でもチャットを始められます。PCでは後からフォルダを紐づけられます
              </div>
              <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="notion-button notion-button-primary px-4 py-2 text-sm font-medium"
                >
                  <MessageSquarePlus size={15} />
                  ワークスペースを作成
                </button>
                <button
                  type="button"
                  onClick={onPickProject}
                  className="notion-button px-4 py-2 text-sm font-medium"
                >
                  <Link2 size={15} />
                  フォルダを紐づける
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-[22px] border border-stone-200/80 bg-white/72 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/40">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-100">
                      フォルダ未連携でも作業できます
                    </div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      チャットを始めて、必要になったタイミングでこのPCのフォルダを紐づけられます。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="notion-button notion-button-primary shrink-0 px-3 py-2 text-xs font-medium"
                  >
                    <MessageSquarePlus size={14} />
                    ワークスペースを作成
                  </button>
                </div>
              </div>

              <section>
                <div className="mb-2 px-1 text-xs font-medium text-stone-500 dark:text-stone-400">
                  フォルダ連携済み
                </div>
                <div className="overflow-hidden rounded-[22px] border border-stone-200/80 bg-white/72 dark:border-stone-800 dark:bg-stone-900/40">
                  {projects.map((project, index) => {
                    const isActive = activeProject?.path === project.path;
                    return (
                      <div
                        key={project.path}
                        className={`group flex items-start gap-3 px-4 py-3 ${
                          isActive ? "bg-stone-50/90 dark:bg-stone-900/80" : ""
                        } ${index > 0 ? "border-t border-stone-100 dark:border-stone-800/80" : ""}`}
                      >
                        <div className="mt-0.5 text-stone-400 dark:text-stone-500">
                          <FolderOpen size={15} />
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenProject(project.path)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                              {project.name}
                            </div>
                            {isActive && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                                <Check size={11} />
                                使用中
                              </span>
                            )}
                          </div>
                          <div className="mt-1 break-all text-xs text-stone-500 dark:text-stone-400">
                            {project.path}
                          </div>
                        </button>
                        <div className="ml-3 flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onRemoveProject(project.path)}
                            className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-stone-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
                            title="一覧から外す"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {isLoading && (
            <div className="mt-4 text-xs text-stone-500 dark:text-stone-400">
              読み込み中...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
