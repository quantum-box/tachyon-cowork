import { useState } from "react";
import { AlertCircle, Mic, MicOff, RefreshCw, X, Square, Menu } from "lucide-react";
import type { useAgentChat } from "../../hooks/useAgentChat";
import type {
  Artifact,
  FileAttachment,
  InlineAttachment,
} from "../../lib/types";
import type { SendKeyMode } from "../../hooks/useSendKey";
import type { useRealtimeVoice } from "../../hooks/useRealtimeVoice";
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
  realtimeVoice?: ReturnType<typeof useRealtimeVoice>;
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

function getRealtimeStatusLabel(
  status: ReturnType<typeof useRealtimeVoice>["status"],
): { text: string; className: string } {
  if (status === "connected") {
    return {
      text: "準備完了",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    };
  }
  if (status === "connecting") {
    return {
      text: "準備中",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    };
  }
  return {
    text: "停止中",
    className:
      "bg-white/70 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  };
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
  realtimeVoice,
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
      <div className="relative flex h-full flex-col bg-transparent transition-colors duration-150">
        <div className="border-b border-stone-200/80 bg-white/55 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/25">
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

        {realtimeVoice?.error && (
          <div className="notion-callout mx-4 mt-4 flex items-center gap-2 rounded-2xl border border-red-200/70 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{realtimeVoice.error}</span>
            <button
              type="button"
              onClick={realtimeVoice.clearError}
              className="shrink-0 rounded-lg p-1 transition-colors hover:bg-red-200/80 dark:hover:bg-red-900/35"
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

        {realtimeVoice && <RealtimeTranscriptPanel voice={realtimeVoice} />}

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
          realtimeVoice={realtimeVoice}
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

function RealtimeTranscriptPanel({
  voice,
}: {
  voice: NonNullable<Props["realtimeVoice"]>;
}) {
  const isActive = voice.status === "connecting" || voice.status === "connected";
  if (!isActive) return null;

  const recentTranscripts = voice.transcripts.slice(-4);
  const statusLabel = getRealtimeStatusLabel(voice.status);

  return (
    <section
      className="fixed right-3 top-1/2 z-30 w-[min(320px,calc(100vw-1.5rem))] -translate-y-1/2 rounded-xl border border-slate-400/20 bg-slate-200/20 px-2.5 py-2 text-[11px] text-slate-800 shadow-[0_18px_42px_rgba(15,23,42,0.12)] backdrop-blur-sm dark:border-white/15 dark:bg-slate-950/20 dark:text-slate-100 sm:right-5"
      aria-label="Realtime"
      aria-live="polite"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-semibold text-sky-800 dark:text-sky-200">
          <Mic size={12} />
          <span>Realtime</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${statusLabel.className}`}
          >
            {statusLabel.text}
          </span>
          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-medium text-sky-700 ring-1 ring-sky-100/35 dark:bg-sky-900/15 dark:text-sky-200 dark:ring-sky-700/25">
            Agentチャットとは別
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isActive && (
            <button
              type="button"
              onClick={voice.stop}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300/55 bg-red-50/30 px-2 py-1 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-100/45 dark:border-red-900/45 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-950/40"
              aria-label="Realtimeを停止"
              title="Realtimeを停止"
            >
              <MicOff size={11} />
              停止
            </button>
          )}
          {voice.transcripts.length > 0 && (
            <button
              type="button"
              onClick={voice.clearTranscripts}
              className="rounded-md p-0.5 text-sky-700 transition-colors hover:bg-sky-100/45 dark:text-sky-200 dark:hover:bg-sky-900/30"
              aria-label="Realtimeをクリア"
              title="Realtimeをクリア"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {recentTranscripts.length === 0 ? (
        <div className="flex items-center gap-1.5 text-sky-700/80 dark:text-sky-200/80">
          {voice.status === "connecting" && (
            <RefreshCw size={11} className="animate-spin" />
          )}
          {voice.status === "connected"
            ? "話しかけるとここに表示されます"
            : "マイクとRealtimeを準備しています..."}
        </div>
      ) : (
        <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
          {recentTranscripts.map((item) => (
            <div
              key={item.id}
              className="flex gap-1.5 rounded-lg bg-white/15 px-2 py-1 ring-1 ring-white/20 dark:bg-slate-950/15 dark:ring-white/10"
            >
              <span className="shrink-0 text-[9px] font-semibold uppercase text-sky-700 dark:text-sky-300">
                {item.role === "user" ? "V" : "RT"}
              </span>
              <span className="min-w-0 whitespace-pre-wrap leading-4">
                {item.text}
                {!item.isFinal && (
                  <span className="ml-1 text-sky-500 dark:text-sky-300">
                    ...
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
