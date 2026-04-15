import { useState } from "react";
import { AlertCircle, RefreshCw, X, Square, Menu } from "lucide-react";
import type { useAgentChat } from "../../hooks/useAgentChat";
import type {
  Artifact,
  FileAttachment,
  InlineAttachment,
} from "../../lib/types";
import type { SendKeyMode } from "../../hooks/useSendKey";
import type { ProjectContext } from "../../lib/tauri-bridge";
import { FileDropZone } from "../file/FileDropZone";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ChatSearch } from "./ChatSearch";

type Props = {
  chat: ReturnType<typeof useAgentChat>;
  files: FileAttachment[];
  fileError: string | null;
  onFilesAdd: (fileList: FileList) => void;
  onFileRemove: (id: string) => void;
  onClearFiles: () => void;
  toInlineAttachments: () => InlineAttachment[];
  onPrepareMessage: (message: string) => Promise<{
    task: string;
    attachments?: InlineAttachment[];
    warnings: string[];
  }>;
  isPreparingFiles?: boolean;
  onOpenArtifact: (artifact: Artifact) => void;
  onOpenCanvas?: (
    title: string,
    content: string,
    contentType: "html" | "jsx",
  ) => void;
  isSearchOpen: boolean;
  onSearchClose: () => void;
  sendKey?: SendKeyMode;
  isOffline?: boolean;
  onOpenTools?: () => void;
  projectContext?: ProjectContext | null;
  onToggleSidebar?: () => void;
};

function formatWorkspaceLabel(projectContext: ProjectContext): string {
  const root = projectContext.root_path.replace(/\/+$/, "");
  const workspace = projectContext.workspace_path;
  if (workspace === root) {
    return "作業ディレクトリ直下";
  }
  if (workspace.startsWith(`${root}/`)) {
    return workspace.slice(root.length + 1);
  }
  return workspace;
}

export function ChatPanel({
  chat,
  files,
  fileError,
  onFilesAdd,
  onFileRemove,
  onClearFiles,
  toInlineAttachments,
  onPrepareMessage,
  isPreparingFiles = false,
  onOpenArtifact,
  onOpenCanvas,
  isSearchOpen,
  onSearchClose,
  sendKey,
  isOffline = false,
  onOpenTools,
  projectContext,
  onToggleSidebar,
}: Props) {
  const [searchQuery] = useState("");
  const hasNetworkIssue = isOffline || chat.error?.kind === "network";
  const workspaceLabel = projectContext
    ? formatWorkspaceLabel(projectContext)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline) return;
    if (!chat.input.trim() && files.length === 0) return;
    const msg = chat.input.trim();
    const prepared =
      files.length > 0
        ? await onPrepareMessage(msg)
        : { task: msg, attachments: toInlineAttachments(), warnings: [] };
    chat.setInput("");
    chat.sendMessage(msg, prepared.attachments, prepared.task);
    onClearFiles();
  };

  return (
    <FileDropZone onFilesDropped={onFilesAdd}>
      <div className="flex h-full flex-col bg-transparent transition-colors duration-150">
        <div className="border-b border-stone-200/80 bg-white/55 py-2.5 backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/25">
          <div className="flex w-full items-center justify-between gap-3 px-2.5 md:px-3">
            <div className="titlebar-safe-header flex min-w-0 items-center gap-3">
              {onToggleSidebar && (
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  className="notion-icon-button p-2 md:hidden"
                  aria-label="メニューを開く"
                >
                  <Menu size={18} />
                </button>
              )}
              <div
                className="titlebar-safe-start min-w-0"
                data-tauri-drag-region
              >
                <div className="notion-label mb-1">Workspace</div>
                <div className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
                  {projectContext?.name ?? "Tachyon Cowork"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {workspaceLabel && (
                <span className="notion-badge hidden px-3 py-1 text-[11px] md:inline-flex">
                  {workspaceLabel}
                </span>
              )}
              {onOpenTools && (
                <button
                  type="button"
                  onClick={onOpenTools}
                  className="notion-button hidden px-3 py-1.5 text-[11px] sm:inline-flex"
                >
                  ファイルツール
                </button>
              )}
              {isOffline && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                  Offline
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Chat search bar */}
        {isSearchOpen && (
          <ChatSearch chunks={chat.chunks} onClose={onSearchClose} />
        )}

        {/* Error banner with retry/dismiss */}
        {hasNetworkIssue && (
          <div className="notion-callout mx-4 mt-4 flex items-start gap-2 rounded-2xl border border-amber-200/70 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
            <AlertCircle size={14} className="shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="font-medium">
                {isOffline
                  ? "オフラインです。チャット送信は停止しています。"
                  : (chat.error?.message ?? "Agent API に接続できません。")}
              </div>
              <div className="text-[11px] text-amber-700 dark:text-amber-400">
                オフラインでも `ファイル検索` `整理` `重複検出` `容量分析`
                は利用できます。
              </div>
            </div>
            {onOpenTools && (
              <button
                type="button"
                onClick={onOpenTools}
                className="shrink-0 rounded-xl border border-amber-200 bg-amber-100 px-2.5 py-1 text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/35"
              >
                ファイルツール
              </button>
            )}
            {!isOffline && (
              <button
                type="button"
                onClick={chat.retryLastMessage}
                className="shrink-0 flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-100 px-2.5 py-1 text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/35"
              >
                <RefreshCw size={12} />
                再試行
              </button>
            )}
            <button
              type="button"
              onClick={chat.clearError}
              className="shrink-0 rounded-lg p-1 hover:bg-amber-200/80 dark:hover:bg-amber-900/35 transition-colors"
              aria-label="閉じる"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {chat.error && chat.error.kind !== "network" && (
          <div className="notion-callout mx-4 mt-4 flex items-center gap-2 rounded-2xl border border-red-200/70 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{chat.error.message}</span>
            <button
              type="button"
              onClick={chat.retryLastMessage}
              className="shrink-0 flex items-center gap-1 rounded-xl border border-red-200 bg-red-100 px-2.5 py-1 text-red-700 transition-colors hover:bg-red-200 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/35"
            >
              <RefreshCw size={12} />
              再試行
            </button>
            <button
              type="button"
              onClick={chat.clearError}
              className="shrink-0 rounded-lg p-1 hover:bg-red-200/80 dark:hover:bg-red-900/35 transition-colors"
              aria-label="閉じる"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* File error banner */}
        {fileError && (
          <div className="notion-callout mx-4 mt-4 rounded-2xl border border-amber-200/70 px-4 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-400">
            {fileError}
          </div>
        )}

        {projectContext && !projectContext.has_agents_file && (
          <div className="notion-callout mx-4 mt-4 rounded-2xl px-4 py-3 text-xs text-stone-600 dark:text-stone-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {projectContext.name}
            </span>
            {` を Workspace として使用中です。`}
            Workspace Custom Instructions はまだありません。作業ディレクトリ画面から
            `AGENTS.md` を保存すると、この Workspace 固有の指示を使えます。
          </div>
        )}

        <MessageList
          chunks={chat.chunks}
          isLoading={chat.isLoading}
          onOpenArtifact={onOpenArtifact}
          onOpenCanvas={onOpenCanvas}
          searchQuery={searchQuery}
          onSendMessage={chat.sendMessage}
          onRetry={chat.retry}
          onDeleteMessage={chat.deleteMessage}
        />

        {/* Stop generation button */}
        {chat.isLoading && (
          <div className="mb-1 flex justify-center -mt-2">
            <button
              type="button"
              onClick={chat.stopGeneration}
              className="notion-button px-3 py-1.5 text-xs"
            >
              <Square size={10} className="fill-current" />
              生成を停止
            </button>
          </div>
        )}

        <ChatInput
          input={chat.input}
          onInputChange={chat.setInput}
          onSubmit={handleSubmit}
          isLoading={chat.isLoading || isPreparingFiles}
          files={files}
          onFilesAdd={onFilesAdd}
          onFileRemove={onFileRemove}
          showPromptTemplates={chat.chunks.length === 0}
          sendKey={sendKey}
          isDisabled={isOffline}
          placeholder={
            isOffline
              ? "オフライン中のためチャット送信はできません"
              : isPreparingFiles
                ? "添付ファイルを解析しています..."
                : undefined
          }
        />
      </div>
    </FileDropZone>
  );
}
