import { useEffect, useRef } from "react";
import { Loader2, BarChart3, FileText, Code, Search } from "lucide-react";
import type { AgentChunk, Artifact } from "../../lib/types";
import { MessageBubble } from "./MessageBubble";

type Props = {
  chunks: AgentChunk[];
  isLoading?: boolean;
  onOpenArtifact?: (artifact: Artifact) => void;
  searchQuery?: string;
  onSendMessage?: (message: string) => void;
};

export function MessageList({ chunks, isLoading, onOpenArtifact, searchQuery, onSendMessage }: Props) {
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
        {chunks.length === 0 && !isLoading && (
          <EmptyState onSendMessage={onSendMessage} />
        )}
        {chunks.map((chunk, index) => (
          <div key={chunk.id} data-chunk-index={index} className="animate-fade-in">
            <MessageBubble
              chunk={chunk}
              onOpenArtifact={onOpenArtifact}
              searchQuery={searchQuery}
            />
          </div>
        ))}
        {isLoading && chunks.length > 0 && (
          <div className="flex justify-start mb-2 gap-2 animate-fade-in">
            <div className="w-8" />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-slate-800 text-xs text-gray-500 dark:text-slate-400">
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

type FeatureCard = {
  Icon: typeof BarChart3;
  title: string;
  subtitle: string;
  prompt: string;
};

const FEATURE_CARDS: FeatureCard[] = [
  {
    Icon: BarChart3,
    title: "データを分析",
    subtitle: "Excel・CSV・グラフの作成",
    prompt: "このExcelファイルの売上データを分析して",
  },
  {
    Icon: FileText,
    title: "文書を作成",
    subtitle: "報告書・メール・テンプレート",
    prompt: "月次報告書のテンプレートを作成して",
  },
  {
    Icon: Code,
    title: "コードを書く",
    subtitle: "Python・JavaScript・その他",
    prompt: "Pythonでファイルを読み込むスクリプトを書いて",
  },
  {
    Icon: Search,
    title: "情報を検索",
    subtitle: "リサーチ・調査・要約",
    prompt: "最新のAI技術トレンドを教えて",
  },
];

function EmptyState({ onSendMessage }: { onSendMessage?: (message: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mb-4">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          className="text-indigo-600 dark:text-indigo-400"
          strokeWidth="1.5"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
        Tachyon Coworkへようこそ
      </h2>
      <p className="text-sm text-gray-500 dark:text-slate-400 max-w-sm mb-8">
        AIアシスタントに何でも聞いてみましょう。
        Excel・PowerPoint・ドキュメント編集から日常タスクまでお手伝いします。
      </p>

      {/* Feature cards grid */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {FEATURE_CARDS.map((card) => (
          <button
            key={card.title}
            onClick={() => onSendMessage?.(card.prompt)}
            className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-left hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-150 group"
          >
            <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 transition-colors duration-150">
              <card.Icon
                size={16}
                className="text-gray-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors duration-150"
              />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-0.5">
                {card.title}
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400">
                {card.subtitle}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
