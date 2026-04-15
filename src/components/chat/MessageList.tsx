import { useEffect, useMemo, useRef } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { AgentChunk, Artifact } from "../../lib/types";
import { MessageBubble } from "./MessageBubble";

type Props = {
  chunks: AgentChunk[];
  isLoading?: boolean;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenCanvas?: (
    title: string,
    content: string,
    contentType: "html" | "jsx",
  ) => void;
  searchQuery?: string;
  onSendMessage?: (message: string) => void;
  onRetry?: () => void;
  onDeleteMessage?: (chunkId: string) => void;
};

function getChunkKey(chunk: AgentChunk, index: number): string {
  return [chunk.type, chunk.id, chunk.created_at, index].join(":");
}

export function MessageList({
  chunks,
  isLoading,
  onOpenArtifact,
  onOpenCanvas,
  searchQuery,
  onSendMessage,
  onRetry,
  onDeleteMessage,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const showInitialLoading = isLoading && chunks.length === 0;

  // Merge tool_call_args into the corresponding tool_call for display
  const displayChunks = useMemo(() => {
    const argsById = new Map<string, AgentChunk>();
    for (const c of chunks) {
      if (c.type === "tool_call_args" && c.tool_id) {
        argsById.set(c.tool_id, c);
      }
    }
    if (argsById.size === 0) return chunks;

    const result: AgentChunk[] = [];
    for (const c of chunks) {
      // Skip tool_call_args that will be folded into their tool_call
      if (
        c.type === "tool_call_args" &&
        c.tool_id &&
        chunks.some((tc) => tc.type === "tool_call" && tc.tool_id === c.tool_id)
      ) {
        continue;
      }
      // Merge args into tool_call
      if (c.type === "tool_call" && c.tool_id && argsById.has(c.tool_id)) {
        const argsChunk = argsById.get(c.tool_id)!;
        result.push({
          ...c,
          args: argsChunk.args,
          tool_arguments: argsChunk.tool_arguments ?? c.tool_arguments,
        });
      } else {
        result.push(c);
      }
    }
    return result;
  }, [chunks]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks]);

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6"
      role="log"
      aria-live="polite"
    >
      <div className="mx-auto max-w-[920px]">
        {showInitialLoading && <LoadingState />}
        {chunks.length === 0 && !isLoading && (
          <EmptyState onSendMessage={onSendMessage} />
        )}
        {displayChunks.map((chunk, index) => {
          const isDeletable =
            onDeleteMessage &&
            (chunk.type === "user" ||
              chunk.type === "say" ||
              chunk.type === "assistant" ||
              chunk.type === "attempt_completion" ||
              chunk.type === "tool_call" ||
              chunk.type === "tool_call_args" ||
              chunk.type === "tool_result");
          return (
            <div
              key={getChunkKey(chunk, index)}
              data-chunk-index={index}
              className="animate-fade-in group/msg relative"
            >
              <MessageBubble
                chunk={chunk}
                onOpenArtifact={onOpenArtifact}
                onOptionSelect={onSendMessage}
                onOpenCanvas={onOpenCanvas}
                searchQuery={searchQuery}
              />
              {isDeletable && (
                <button
                  onClick={() => onDeleteMessage(chunk.id)}
                  className="absolute right-1 top-1 rounded-lg p-1 opacity-0 transition-all text-stone-300 hover:bg-red-50 hover:text-red-400 group-hover/msg:opacity-100 dark:text-stone-600 dark:hover:bg-red-950/20 dark:hover:text-red-400"
                  title="メッセージを削除"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
        {isLoading && chunks.length > 0 && (
          <div className="mb-2 flex justify-start gap-2 animate-fade-in">
            <div className="w-8" />
            <div className="notion-badge px-3 py-1.5 text-xs">
              <Loader2 size={12} className="animate-spin" />
              AIが応答中...
            </div>
          </div>
        )}
        {!isLoading && displayChunks.length > 0 && onRetry && (
          <div className="mb-2 flex justify-start gap-2">
            <div className="w-8" />
            <button
              onClick={onRetry}
              className="notion-button px-3 py-1.5 text-xs"
            >
              <RefreshCw size={12} />
              再生成
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[280px] items-center justify-center">
      <div className="notion-badge px-4 py-2 text-sm">
        <Loader2 size={14} className="animate-spin" />
        読み込み中...
      </div>
    </div>
  );
}

function EmptyState(_: { onSendMessage?: (message: string) => void }) {
  return (
    <div className="flex h-full min-h-[320px] items-center px-2">
      <div className="w-full max-w-2xl">
        <div className="notion-label mb-2">Tachyon Cowork</div>
        <h2 className="text-[2rem] font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          今日は何を進めますか
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-stone-500 dark:text-stone-400">
          会話しながら、文章作成、調査、分析、ローカルファイル作業まで
          ひと続きで進められます。
        </p>
        <p className="mt-6 text-xs text-stone-400 dark:text-stone-500">
          下の入力欄からそのまま話しかけられます。
        </p>
      </div>
    </div>
  );
}
