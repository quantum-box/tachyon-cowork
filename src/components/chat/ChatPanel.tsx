import { useState } from "react";
import { AlertCircle, RefreshCw, X, Square } from "lucide-react";
import type { useAgentChat } from "../../hooks/useAgentChat";
import type { Artifact, FileAttachment, InlineAttachment } from "../../lib/types";
import type { SendKeyMode } from "../../hooks/useSendKey";
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
  onOpenArtifact: (artifact: Artifact) => void;
  onOpenCanvas?: (title: string, content: string, contentType: "html" | "jsx") => void;
  isSearchOpen: boolean;
  onSearchClose: () => void;
  sendKey?: SendKeyMode;
  isOffline?: boolean;
  onOpenTools?: () => void;
};

export function ChatPanel({
  chat,
  files,
  fileError,
  onFilesAdd,
  onFileRemove,
  onClearFiles,
  toInlineAttachments,
  onOpenArtifact,
  onOpenCanvas,
  isSearchOpen,
  onSearchClose,
  sendKey,
  isOffline = false,
  onOpenTools,
}: Props) {
  const [searchQuery] = useState("");
  const hasNetworkIssue = isOffline || chat.error?.kind === "network";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline) return;
    if (!chat.input.trim() && files.length === 0) return;
    const attachments = files.length > 0 ? toInlineAttachments() : undefined;
    const msg = chat.input.trim();
    chat.setInput("");
    chat.sendMessage(msg, attachments);
    onClearFiles();
  };

  return (
    <FileDropZone onFilesDropped={onFilesAdd}>
      <div className="flex flex-col h-full bg-white dark:bg-slate-950 transition-colors duration-150">
        {/* Chat search bar */}
        {isSearchOpen && (
          <ChatSearch chunks={chat.chunks} onClose={onSearchClose} />
        )}

        {/* Error banner with retry/dismiss */}
        {hasNetworkIssue && (
          <div className="mx-4 mt-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="font-medium">
                {isOffline
                  ? "オフラインです。チャット送信は停止しています。"
                  : (chat.error?.message ?? "Agent API に接続できません。")}
              </div>
              <div className="text-[11px] text-amber-700 dark:text-amber-400">
                オフラインでも `ファイル検索` `整理` `重複検出` `容量分析` は利用できます。
              </div>
            </div>
            {onOpenTools && (
              <button
                type="button"
                onClick={onOpenTools}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-800/30 hover:bg-amber-200 dark:hover:bg-amber-800/50 text-amber-800 dark:text-amber-200 transition-colors"
              >
                ファイルツール
              </button>
            )}
            {!isOffline && (
              <button
                type="button"
                onClick={chat.retryLastMessage}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-800/30 hover:bg-amber-200 dark:hover:bg-amber-800/50 text-amber-800 dark:text-amber-200 transition-colors"
              >
                <RefreshCw size={12} />
                再試行
              </button>
            )}
            <button
              type="button"
              onClick={chat.clearError}
              className="shrink-0 p-1 rounded-md hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors"
              aria-label="閉じる"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {chat.error && chat.error.kind !== "network" && (
          <div className="mx-4 mt-3 px-4 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{chat.error.message}</span>
            <button
              type="button"
              onClick={chat.retryLastMessage}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 dark:bg-red-800/30 hover:bg-red-200 dark:hover:bg-red-800/50 text-red-700 dark:text-red-300 transition-colors"
            >
              <RefreshCw size={12} />
              再試行
            </button>
            <button
              type="button"
              onClick={chat.clearError}
              className="shrink-0 p-1 rounded-md hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
              aria-label="閉じる"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* File error banner */}
        {fileError && (
          <div className="mx-4 mt-3 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
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

        {/* Stop generation button */}
        {chat.isLoading && (
          <div className="flex justify-center -mt-2 mb-1">
            <button
              type="button"
              onClick={chat.stopGeneration}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
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
          isLoading={chat.isLoading}
          files={files}
          onFilesAdd={onFilesAdd}
          onFileRemove={onFileRemove}
          showPromptTemplates={chat.chunks.length === 0}
          sendKey={sendKey}
          isDisabled={isOffline}
          placeholder={
            isOffline
              ? "オフライン中のためチャット送信はできません"
              : undefined
          }
        />
      </div>
    </FileDropZone>
  );
}
