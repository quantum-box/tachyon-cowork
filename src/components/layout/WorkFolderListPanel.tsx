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
              作業ディレクトリ一覧
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              作業ディレクトリを開いて切り替えます
            </p>
          </div>
          <div className="ml-auto">
            <button
              type="button"
              onClick={onPickProject}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Plus size={14} />
              作業ディレクトリを開く
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-6">
          <section className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.9fr)]">
            <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 via-white to-gray-100 px-5 py-5 dark:border-slate-700 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white p-2 text-gray-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                  <FolderOpen size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    作業ディレクトリをここで管理します
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                    顧客別や案件別にディレクトリを登録しておくと、その仕事ごとの画面にすぐ入れます。
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onPickProject}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  <Plus size={15} />
                  作業ディレクトリを開く
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-5 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
                使用中
              </div>
              {activeProject ? (
                <div className="mt-3">
                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {activeProject.name}
                  </div>
                  <div className="mt-1 break-all text-xs text-gray-500 dark:text-slate-400">
                    {activeProject.path}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenProject(activeProject.path)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    この作業ディレクトリを開く
                  </button>
                </div>
              ) : (
                <div className="mt-3 text-sm text-gray-500 dark:text-slate-400">
                  まだ選ばれていません。まず 1 つ開くと、ここからすぐ入れます。
                </div>
              )}
            </div>
          </section>

          {recentProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center dark:border-slate-700">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                <FolderOpen size={18} />
              </div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                作業ディレクトリはまだありません
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                まず1つ開くと、ここに一覧表示されます
              </div>
              <button
                type="button"
                onClick={onPickProject}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                <Plus size={15} />
                最初の作業ディレクトリを開く
              </button>
            </div>
          ) : (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    登録済みの作業ディレクトリ
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    開くと、その作業ディレクトリ専用の画面に移動します
                  </p>
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-500">
                  {recentProjects.length} 件
                </div>
              </div>

              <div className="space-y-3">
                {recentProjects.map((project) => {
                  const isActive = activeProject?.path === project.path;
                  return (
                    <div
                      key={project.path}
                      className={`group rounded-2xl border px-4 py-4 ${
                        isActive
                          ? "border-indigo-200 bg-indigo-50/80 dark:border-indigo-800 dark:bg-indigo-900/20"
                          : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/40"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 rounded-xl p-2 ${
                            isActive
                              ? "bg-white text-indigo-600 dark:bg-slate-900 dark:text-indigo-300"
                              : "bg-gray-50 text-gray-500 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          <FolderOpen size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                              {project.name}
                            </div>
                            {isActive && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                <Check size={12} />
                                使用中
                              </span>
                            )}
                          </div>
                          <div className="mt-1 break-all text-xs text-gray-500 dark:text-slate-400">
                            {project.path}
                          </div>
                          <div className="mt-4 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenProject(project.path)}
                              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              開く
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveProject(project.path)}
                              className="rounded-lg px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
                            >
                              一覧から外す
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveProject(project.path)}
                          className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-red-400"
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
          )}

          {isLoading && (
            <div className="mt-4 text-xs text-gray-500 dark:text-slate-400">
              読み込み中...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
