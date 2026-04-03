import { useState } from "react";
import type { useAgentChat } from "../../hooks/useAgentChat";
import type { Artifact, FileAttachment, InlineAttachment } from "../../lib/types";
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
}: Props) {
  const [searchQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

        {/* Error banner */}
        {chat.error && (
          <div className="mx-4 mt-3 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
            {chat.error.message}
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

        <ChatInput
          input={chat.input}
          onInputChange={chat.setInput}
          onSubmit={handleSubmit}
          isLoading={chat.isLoading}
          files={files}
          onFilesAdd={onFilesAdd}
          onFileRemove={onFileRemove}
        />
      </div>
    </FileDropZone>
  );
}
