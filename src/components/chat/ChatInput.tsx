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
import type { SendKeyMode } from "../../hooks/useSendKey";
import { FilePreview } from "../file/FilePreview";
import { PromptTemplates } from "./PromptTemplates";

type ChatInputProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isLoading?: boolean;
  placeholder?: string;
  files: FileAttachment[];
  onFilesAdd: (fileList: FileList) => void;
  onFileRemove: (id: string) => void;
  showPromptTemplates?: boolean;
  sendKey?: SendKeyMode;
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
  showPromptTemplates,
  sendKey = "enter",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter") return;

      if (sendKey === "cmd-enter") {
        // Cmd/Ctrl+Enter = send, plain Enter = newline
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          if ((input.trim() || files.length > 0) && !isLoading) {
            onSubmit(e as unknown as FormEvent);
          }
        }
        // Shift+Enter and plain Enter: allow default (newline)
      } else {
        // Enter = send, Shift+Enter = newline, Cmd/Ctrl+Enter also sends
        if (!e.shiftKey) {
          e.preventDefault();
          if ((input.trim() || files.length > 0) && !isLoading) {
            onSubmit(e as unknown as FormEvent);
          }
        }
      }
    },
    [input, files.length, isLoading, onSubmit, sendKey],
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

  const handleTemplateSelect = useCallback(
    (prompt: string) => {
      onInputChange(prompt);
      // Focus and place cursor at the end
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
        }
      });
    },
    [onInputChange],
  );

  const hasContent = input.trim() || files.length > 0;

  return (
    <form
      onSubmit={onSubmit}
      className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-4 transition-colors duration-150"
    >
      <div className="max-w-3xl mx-auto">
        {/* Prompt templates */}
        <PromptTemplates
          onSelect={handleTemplateSelect}
          visible={!!showPromptTemplates && !input.trim() && files.length === 0}
        />

        {/* File preview chips */}
        <FilePreview files={files} onRemove={onFileRemove} />

        <div className="flex items-end gap-3">
          {/* Paperclip button */}
          <button
            type="button"
            onClick={handlePickFiles}
            disabled={isLoading}
            className="shrink-0 rounded-2xl p-3 text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
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
            className="flex-1 resize-none rounded-2xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 disabled:opacity-50 placeholder:text-gray-400 dark:placeholder:text-slate-500 transition-all duration-150"
          />
          <button
            type="submit"
            disabled={!hasContent || isLoading}
            className="shrink-0 rounded-2xl bg-indigo-600 dark:bg-indigo-600 p-3 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <SendHorizonal size={18} />
          </button>
        </div>
      </div>
    </form>
  );
}
