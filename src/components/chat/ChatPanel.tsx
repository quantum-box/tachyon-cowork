import type { useAgentChat } from "../../hooks/useAgentChat";
import type { Artifact, FileAttachment } from "../../lib/types";
import { FileDropZone } from "../file/FileDropZone";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

type Props = {
  chat: ReturnType<typeof useAgentChat>;
  files: FileAttachment[];
  fileError: string | null;
  onFilesAdd: (fileList: FileList) => void;
  onFileRemove: (id: string) => void;
  onClearFiles: () => void;
  onOpenArtifact: (artifact: Artifact) => void;
};

export function ChatPanel({
  chat,
  files,
  fileError,
  onFilesAdd,
  onFileRemove,
  onClearFiles,
  onOpenArtifact,
}: Props) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chat.input.trim() && files.length === 0) return;
    // Clear files after submitting
    chat.handleSubmit(e);
    onClearFiles();
  };

  return (
    <FileDropZone onFilesDropped={onFilesAdd}>
      <div className="flex flex-col h-full bg-white">
        {/* Error banner */}
        {chat.error && (
          <div className="mx-4 mt-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {chat.error.message}
          </div>
        )}

        {/* File error banner */}
        {fileError && (
          <div className="mx-4 mt-3 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            {fileError}
          </div>
        )}

        <MessageList
          chunks={chat.chunks}
          isLoading={chat.isLoading}
          onOpenArtifact={onOpenArtifact}
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
