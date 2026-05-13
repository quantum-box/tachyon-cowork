import {
  useCallback,
  useEffect,
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
  focusRequest?: number;
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
  focusRequest,
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

  useEffect(() => {
    if (!focusRequest || isDisabled) return;

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [focusRequest, isDisabled]);

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
  const isVoiceActive = isVoiceConnecting || isVoiceConnected;

  const handleVoiceClick = useCallback(async () => {
    if (!realtimeVoice || isDisabled || isLoading) return;
    if (isVoiceActive) {
      realtimeVoice.stop();
      return;
    }
    await realtimeVoice.start();
  }, [isDisabled, isLoading, isVoiceActive, realtimeVoice]);

  return (
    <form
      onSubmit={onSubmit}
      className="sticky bottom-0 z-20 bg-transparent px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-1.5 transition-colors duration-150 backdrop-blur-none dark:bg-transparent sm:px-3 sm:pb-[calc(env(safe-area-inset-bottom)+0.625rem)] sm:pt-2"
    >
      <div className="mx-auto w-full max-w-none">
        {/* Prompt templates */}
        <PromptTemplates
          onSelect={handleTemplateSelect}
          visible={!!showPromptTemplates && !input.trim() && files.length === 0}
        />

        {/* File preview chips */}
        <FilePreview files={files} onRemove={onFileRemove} />

        <div className="rounded-[24px] border border-stone-200/85 bg-white/92 p-1.5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] dark:border-stone-700/80 dark:bg-stone-900/90 sm:rounded-[26px] sm:p-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder ?? "メッセージを入力..."}
            disabled={isDisabled}
            rows={1}
            className="max-h-[220px] min-h-[44px] w-full resize-none overflow-y-auto rounded-[18px] bg-transparent px-3 py-2.5 text-[16px] leading-6 text-stone-900 outline-none ring-0 placeholder:text-stone-400 disabled:opacity-50 dark:text-stone-100 dark:placeholder:text-stone-500 sm:min-h-[58px] sm:rounded-[20px] sm:px-4 sm:py-3 sm:text-[15px]"
          />

          <div className="mt-1 flex items-center justify-between gap-2 px-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handlePickFiles}
                disabled={isLoading || isDisabled}
                className={[
                  "notion-icon-button min-h-9 min-w-9 shrink-0 rounded-2xl p-2 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10 sm:min-w-10 sm:p-2.5",
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
                    "notion-icon-button min-h-9 shrink-0 rounded-2xl disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10",
                    isVoiceActive
                      ? "min-w-[74px] gap-1.5 border-red-200/80 bg-red-50 px-3 py-2 font-bold text-red-700 shadow-sm hover:bg-red-100 dark:border-red-800/55 dark:bg-red-950/35 dark:text-red-300 dark:hover:bg-red-950/55 sm:min-w-[82px] sm:px-3.5 sm:py-2.5"
                      : "min-w-9 p-2 sm:min-w-10 sm:p-2.5",
                  ].join(" ")}
                  aria-label={
                    isVoiceActive ? "音声会話を停止" : "音声会話を開始"
                  }
                  title={
                    isVoiceActive ? "音声会話を停止" : "音声会話を開始"
                  }
                >
                  {isVoiceConnecting ? (
                    <Loader2 size={19} className="animate-spin" />
                  ) : isVoiceConnected ? (
                    <MicOff size={19} />
                  ) : (
                    <Mic size={19} />
                  )}
                  {isVoiceActive && <span className="text-[12px]">停止</span>}
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
                className="notion-button-primary min-h-9 min-w-9 shrink-0 rounded-full p-2 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10 sm:min-w-10 sm:p-2.5"
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
