import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { AgentChunk } from "../../lib/types";
import { MessageBubble } from "./MessageBubble";

type Props = {
  chunks: AgentChunk[];
  isLoading?: boolean;
};

export function MessageList({ chunks, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks]);

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-6"
      role="log"
      aria-live="polite"
    >
      <div className="max-w-3xl mx-auto">
        {chunks.length === 0 && !isLoading && <EmptyState />}
        {chunks.map((chunk) => (
          <MessageBubble key={chunk.id} chunk={chunk} />
        ))}
        {isLoading && chunks.length > 0 && (
          <div className="flex justify-start mb-2 gap-2">
            <div className="w-8" />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-xs text-gray-500">
              <Loader2 size={12} className="animate-spin" />
              AIが応答中...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          className="text-indigo-600"
          strokeWidth="1.5"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">
        Tachyon Cowork
      </h2>
      <p className="text-sm text-gray-500 max-w-sm">
        AIアシスタントに何でも聞いてみましょう。
        Excel・PowerPoint・ドキュメント編集から日常タスクまでお手伝いします。
      </p>
    </div>
  );
}
