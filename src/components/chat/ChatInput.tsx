import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import { Loader2, Mic, MicOff, Paperclip, SendHorizonal } from "lucide-react";
import { pickFiles } from "../../lib/tauri-bridge";
import type { FileAttachment } from "../../lib/types";
import type { SendKeyMode } from "../../hooks/useSendKey";
import type { useRealtimeVoice } from "../../hooks/useRealtimeVoice";
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
  realtimeVoice?: ReturnType<typeof useRealtimeVoice>;
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
  realtimeVoice,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    resizeTextarea(el);
  }, [input, resizeTextarea]);

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
      resizeTextarea(e.target);
    },
    [onInputChange, resizeTextarea],
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
          resizeTextarea(el);
        }
      });
    },
    [onInputChange, resizeTextarea],
  );

  const hasContent = input.trim() || files.length > 0;
  const voiceStatus = realtimeVoice?.status ?? "idle";
  const isVoiceConnecting = voiceStatus === "connecting";
  const isVoiceConnected = voiceStatus === "connected";

  const handleVoiceClick = useCallback(async () => {
    if (!realtimeVoice || isDisabled || isLoading) return;
    if (isVoiceConnected || isVoiceConnecting) {
      realtimeVoice.stop();
      return;
    }
    await realtimeVoice.start();
  }, [
    isDisabled,
    isLoading,
    isVoiceConnected,
    isVoiceConnecting,
    realtimeVoice,
  ]);

  return (
    <form
      onSubmit={onSubmit}
      className="sticky bottom-0 z-20 bg-white/95 px-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2 transition-colors duration-150 backdrop-blur-md dark:bg-slate-900/95 sm:px-3 sm:pb-[calc(env(safe-area-inset-bottom)+0.625rem)]"
    >
      <div className="mx-auto w-full max-w-none">
        {/* Prompt templates */}
        <PromptTemplates
          onSelect={handleTemplateSelect}
          visible={!!showPromptTemplates && !input.trim() && files.length === 0}
        />

        {/* File preview chips */}
        <FilePreview files={files} onRemove={onFileRemove} />

        <div className="rounded-[26px] border border-stone-200/85 bg-white/92 p-2 shadow-[0_12px_28px_rgba(15,23,42,0.05)] dark:border-stone-700/80 dark:bg-stone-900/90">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder ?? "メッセージを入力..."}
            disabled={isDisabled}
            rows={1}
            className="max-h-[220px] min-h-[52px] w-full resize-none overflow-y-auto rounded-[20px] bg-transparent px-4 py-3 text-[16px] leading-6 text-stone-900 outline-none ring-0 placeholder:text-stone-400 disabled:opacity-50 dark:text-stone-100 dark:placeholder:text-stone-500 sm:min-h-[58px] sm:text-[15px]"
          />

          <div className="mt-1 flex items-center justify-between gap-2 px-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handlePickFiles}
                disabled={isLoading || isDisabled}
                className={[
                  "notion-icon-button min-h-10 min-w-10 shrink-0 rounded-2xl p-2.5 disabled:cursor-not-allowed disabled:opacity-40",
                ].join(" ")}
                aria-label="ファイルを添付"
                title="ファイルを添付"
              >
                <Paperclip size={19} />
              </button>

              {realtimeVoice && (
                <button
                  type="button"
                  onClick={handleVoiceClick}
                  disabled={isDisabled || isLoading}
                  className={[
                    "notion-icon-button min-h-10 min-w-10 shrink-0 rounded-2xl p-2.5 disabled:cursor-not-allowed disabled:opacity-40",
                    isVoiceConnected
                      ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                      : "",
                  ].join(" ")}
                  aria-label={
                    isVoiceConnected || isVoiceConnecting
                      ? "音声会話を終了"
                      : "音声会話を開始"
                  }
                  title={
                    isVoiceConnected
                      ? "音声会話を終了"
                      : isVoiceConnecting
                        ? "音声会話に接続中"
                        : "音声会話を開始"
                  }
                >
                  {isVoiceConnecting ? (
                    <Loader2 size={19} className="animate-spin" />
                  ) : isVoiceConnected ? (
                    <MicOff size={19} />
                  ) : (
                    <Mic size={19} />
                  )}
                </button>
              )}
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden truncate text-[11px] text-stone-400 dark:text-stone-500 sm:inline">
                {sendKey === "cmd-enter"
                  ? "⌘/Ctrl + Enter で送信 / Shift + Enter で改行"
                  : "Enter で送信 / Shift + Enter で改行"}
              </span>
              <button
                type="submit"
                disabled={!hasContent || isLoading || isDisabled}
                className="notion-button-primary min-h-10 min-w-10 shrink-0 rounded-full p-2.5 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="送信"
              >
                <SendHorizonal size={19} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
