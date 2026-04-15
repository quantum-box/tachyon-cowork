import { ArrowLeft, Check, FolderOpen, Plus, X } from "lucide-react";
import type { ProjectEntry } from "../../lib/tauri-bridge";

type Props = {
  onBack: () => void;
  onPickProject: () => void;
  recentProjects: ProjectEntry[];
  activeProject?: ProjectEntry | null;
  isLoading?: boolean;
  onOpenProject: (path: string) => void;
  onRemoveProject: (path: string) => void;
};

export function WorkFolderListPanel({
  onBack,
  onPickProject,
  recentProjects,
  activeProject,
  isLoading = false,
  onOpenProject,
  onRemoveProject,
}: Props) {
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
              作業ディレクトリ一覧
            </h2>
            <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
              開く・切り替える・一覧から外す
            </p>
          </div>
          <button
            type="button"
            onClick={onPickProject}
            className="notion-button notion-button-primary relative z-10 shrink-0 px-3 py-1.5 text-xs font-medium"
          >
            <Plus size={14} />
            開く
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4">
          {projects.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-stone-200 px-6 py-10 text-center dark:border-stone-800">
              <div className="text-sm font-medium text-stone-800 dark:text-stone-100">
                作業ディレクトリはまだありません
              </div>
              <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                まず1つ開くと、ここに一覧表示されます
              </div>
              <button
                type="button"
                onClick={onPickProject}
                className="notion-button notion-button-primary mt-4 px-4 py-2 text-sm font-medium"
              >
                <Plus size={15} />
                最初の作業ディレクトリを開く
              </button>
            </div>
          ) : (
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
