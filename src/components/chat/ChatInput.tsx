import {
  useCallback,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import { SendHorizonal, Paperclip } from "lucide-react";
import { pickFiles } from "../../lib/tauri-bridge";
import type { FileAttachment } from "../../lib/types";
import { FilePreview } from "../file/FilePreview";

type ChatInputProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isLoading?: boolean;
  placeholder?: string;
  files: FileAttachment[];
  onFilesAdd: (fileList: FileList) => void;
  onFileRemove: (id: string) => void;
};

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isLoading,
  placeholder,
  files,
  onFilesAdd,
  onFileRemove,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if ((input.trim() || files.length > 0) && !isLoading) {
          onSubmit(e as unknown as FormEvent);
        }
      }
    },
    [input, files.length, isLoading, onSubmit],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onInputChange(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    },
    [onInputChange],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.files;
      if (items.length > 0) {
        e.preventDefault();
        onFilesAdd(items);
      }
    },
    [onFilesAdd],
  );

  const handlePickFiles = useCallback(async () => {
    const fileList = await pickFiles({ multiple: true });
    if (fileList) {
      onFilesAdd(fileList);
    }
  }, [onFilesAdd]);

  const hasContent = input.trim() || files.length > 0;

  return (
    <form onSubmit={onSubmit} className="border-t border-gray-200 bg-white p-4">
      <div className="max-w-3xl mx-auto">
        {/* File preview chips */}
        <FilePreview files={files} onRemove={onFileRemove} />

        <div className="flex items-end gap-3">
          {/* Paperclip button */}
          <button
            type="button"
            onClick={handlePickFiles}
            disabled={isLoading}
            className="shrink-0 rounded-2xl p-3 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="ファイルを添付"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder ?? "メッセージを入力..."}
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 placeholder:text-gray-400 transition-all"
          />
          <button
            type="submit"
            disabled={!hasContent || isLoading}
            className="shrink-0 rounded-2xl bg-indigo-600 p-3 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <SendHorizonal size={18} />
          </button>
        </div>
      </div>
    </form>
  );
}
