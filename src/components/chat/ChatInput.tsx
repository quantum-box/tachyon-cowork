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
  isDisabled?: boolean;
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
  isDisabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter") return;

      if (sendKey === "cmd-enter") {
        // Cmd/Ctrl+Enter = send, plain Enter = newline
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          if ((input.trim() || files.length > 0) && !isLoading && !isDisabled) {
            onSubmit(e as unknown as FormEvent);
          }
        }
        // Shift+Enter and plain Enter: allow default (newline)
      } else {
        // Enter = send, Shift+Enter = newline, Cmd/Ctrl+Enter also sends
        if (!e.shiftKey) {
          e.preventDefault();
          if ((input.trim() || files.length > 0) && !isLoading && !isDisabled) {
            onSubmit(e as unknown as FormEvent);
          }
        }
      }
    },
    [input, files.length, isDisabled, isLoading, onSubmit, sendKey],
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
      className="px-3 pb-2.5 pt-2 transition-colors duration-150"
    >
      <div className="mx-auto max-w-[920px]">
        {/* Prompt templates */}
        <PromptTemplates
          onSelect={handleTemplateSelect}
          visible={!!showPromptTemplates && !input.trim() && files.length === 0}
        />

        {/* File preview chips */}
        <FilePreview files={files} onRemove={onFileRemove} />

        <div className="rounded-[22px] border border-stone-200/80 bg-white/92 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.045)] dark:border-stone-700/80 dark:bg-stone-900/90">
          <div className="flex items-end gap-1.5">
            {/* Paperclip button */}
            <button
              type="button"
              onClick={handlePickFiles}
              disabled={isLoading || isDisabled}
              className="notion-icon-button shrink-0 rounded-2xl p-2.5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="ファイルを添付"
            >
              <Paperclip size={17} />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder ?? "メッセージを入力..."}
              disabled={isLoading || isDisabled}
              rows={1}
              className="min-h-[46px] flex-1 resize-none rounded-2xl bg-transparent px-3 py-2.5 text-[15px] leading-6 text-stone-900 outline-none ring-0 placeholder:text-stone-400 disabled:opacity-50 dark:text-stone-100 dark:placeholder:text-stone-500"
            />
            <button
              type="submit"
              disabled={!hasContent || isLoading || isDisabled}
              className="notion-button-primary shrink-0 rounded-2xl p-2.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendHorizonal size={17} />
            </button>
          </div>
          <div className="flex items-center justify-between px-2.5 pb-0.5 pt-1.5 text-[11px] text-stone-400 dark:text-stone-500">
            <span>
              {sendKey === "cmd-enter"
                ? "⌘/Ctrl + Enter で送信"
                : "Enter で送信"}
            </span>
            <span>Shift + Enter で改行</span>
          </div>
        </div>
      </div>
    </form>
  );
}
