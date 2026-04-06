import { useState, useCallback, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  User,
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle,
  Loader2,
  Code,
  FileDown,
  X,
  ZoomIn,
  Copy,
  Check,
} from "lucide-react";
import type { AgentChunk, Artifact } from "../../lib/types";
import { chunkToArtifact } from "../../hooks/useArtifact";
import { CodeBlock } from "../artifact/CodeBlock";
import { MermaidDiagram } from "../artifact/MermaidDiagram";

type Props = {
  chunk: AgentChunk;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOptionSelect?: (option: string) => void;
  searchQuery?: string;
};

export function MessageBubble({ chunk, onOpenArtifact, onOptionSelect, searchQuery }: Props) {
  switch (chunk.type) {
    case "user":
      return (
        <UserMessage
          text={chunk.text ?? ""}
          imageUrls={chunk.imageUrls}
          searchQuery={searchQuery}
        />
      );
    case "say":
    case "assistant":
    case "attempt_completion":
      return (
        <AssistantMessage
          text={chunk.text || chunk.content || ""}
          onOpenArtifact={onOpenArtifact}
          searchQuery={searchQuery}
        />
      );
    case "thinking":
      return (
        <ThinkingMessage
          text={chunk.thinking || chunk.text}
          isFinished={chunk.is_finished}
        />
      );
    case "tool_call":
    case "tool_call_args":
    case "tool_call_pending":
      return <ToolCallMessage chunk={chunk} />;
    case "tool_result":
      return <ToolResultMessage chunk={chunk} />;
    case "usage":
      return null;
    case "tool_job_started":
      return (
        <div className="flex justify-start mb-2">
          <div className="text-xs px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            Tool Job: {chunk.provider || "unknown"} (
            {chunk.job_id?.slice(0, 8)}...)
          </div>
        </div>
      );
    case "artifact":
      return <ArtifactMessage chunk={chunk} onOpenArtifact={onOpenArtifact} />;
    case "ask":
      return (
        <div className="flex justify-start mb-3">
          <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-gray-900 dark:text-gray-100">
            <p className="font-medium mb-2">{chunk.text}</p>
            {chunk.options && (
              <div className="flex flex-wrap gap-2">
                {chunk.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onOptionSelect?.(opt)}
                    className="px-2 py-1 text-xs rounded-lg bg-yellow-100 dark:bg-yellow-800/40 text-yellow-800 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-700/50 transition-colors cursor-pointer"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    default:
      return null;
  }
}

function UserMessage({
  text,
  imageUrls,
  searchQuery,
}: {
  text: string;
  imageUrls?: string[];
  searchQuery?: string;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const hasImages = imageUrls && imageUrls.length > 0;

  return (
    <>
      <div className="flex justify-end mb-4 gap-2">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 bg-indigo-600 dark:bg-indigo-700 text-white text-sm leading-relaxed">
          {/* Image thumbnails */}
          {hasImages && (
            <div className="flex flex-wrap gap-2 mb-2">
              {imageUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxUrl(url)}
                  className="group relative rounded-lg overflow-hidden ring-1 ring-white/20 hover:ring-white/50 transition-all"
                >
                  <img
                    src={url}
                    alt={`添付画像 ${i + 1}`}
                    className="h-24 w-24 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ZoomIn
                      size={16}
                      className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap">
            {searchQuery ? highlightInText(text, searchQuery) : text}
          </div>
        </div>
        <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
          <User size={16} className="text-indigo-600 dark:text-indigo-400" />
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => e.key === "Escape" && setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="画像プレビュー"
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
            aria-label="閉じる"
          >
            <X size={24} />
          </button>
          <img
            src={lightboxUrl}
            alt="プレビュー"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

/** Parse code blocks from markdown text */
type CodeBlockInfo = {
  language: string;
  code: string;
};

function extractCodeBlocks(text: string): CodeBlockInfo[] {
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  const blocks: CodeBlockInfo[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || "plaintext",
      code: match[2].trimEnd(),
    });
  }
  return blocks;
}

function AssistantMessage({
  text,
  onOpenArtifact,
  searchQuery: _searchQuery,
}: {
  text: string;
  onOpenArtifact?: (artifact: Artifact) => void;
  searchQuery?: string;
}) {
  const [copied, setCopied] = useState(false);
  const codeBlocks = extractCodeBlocks(text);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  const handleOpenCodeBlock = useCallback(
    (block: CodeBlockInfo, index: number) => {
      if (!onOpenArtifact) return;
      const artifact: Artifact = {
        id: crypto.randomUUID(),
        type: "code",
        title: `コードブロック ${index + 1}`,
        content: block.code,
        language: block.language,
        createdAt: new Date().toISOString(),
      };
      onOpenArtifact(artifact);
    },
    [onOpenArtifact],
  );

  return (
    <div className="mb-6 group/msg">
      <div className="max-w-3xl text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-pre:bg-transparent prose-pre:p-0 prose-code:text-indigo-600 dark:prose-code:text-indigo-400 prose-code:before:content-[''] prose-code:after:content-[''] text-gray-900 dark:text-gray-100 prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-a:text-indigo-600 dark:prose-a:text-indigo-400">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              const codeString = String(children).replace(/\n$/, "");

              const isInline = !className;

              if (isInline) {
                return (
                  <code
                    className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 text-xs font-mono"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              const language = match?.[1] || "";

              if (language === "mermaid") {
                return <MermaidDiagram chart={codeString} />;
              }

              return <CodeBlock code={codeString} language={language} />;
            },
            pre({ children }) {
              return <>{children}</>;
            },
            table({ children }) {
              return (
                <div className="my-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700 text-xs">
                    {children}
                  </table>
                </div>
              );
            },
            thead({ children }) {
              return (
                <thead className="bg-gray-50 dark:bg-slate-800/80">
                  {children}
                </thead>
              );
            },
            th({ children }) {
              return (
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-slate-800">
                  {children}
                </td>
              );
            },
            blockquote({ children }) {
              return (
                <blockquote className="my-2 border-l-3 border-indigo-300 dark:border-indigo-600 pl-3 text-gray-600 dark:text-slate-400 italic">
                  {children}
                </blockquote>
              );
            },
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {children}
                </a>
              );
            },
            ul({ children }) {
              return (
                <ul className="my-1.5 ml-4 list-disc space-y-0.5 marker:text-gray-400 dark:marker:text-slate-500">
                  {children}
                </ul>
              );
            },
            ol({ children }) {
              return (
                <ol className="my-1.5 ml-4 list-decimal space-y-0.5 marker:text-gray-400 dark:marker:text-slate-500">
                  {children}
                </ol>
              );
            },
            hr() {
              return (
                <hr className="my-4 border-gray-200 dark:border-slate-700" />
              );
            },
          }}
        >
          {text}
        </ReactMarkdown>

        {/* Action buttons row */}
        <div className="mt-2 flex flex-wrap items-center gap-2 not-prose opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150">
          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-500" />
                コピー済み
              </>
            ) : (
              <>
                <Copy size={12} />
                コピー
              </>
            )}
          </button>

          {/* Artifact buttons for code blocks */}
          {codeBlocks.map((block, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleOpenCodeBlock(block, i)}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            >
              <Code size={12} />
              Artifactで開く
              {codeBlocks.length > 1 && (
                <span className="text-indigo-400 dark:text-indigo-500">
                  ({block.language})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThinkingMessage({
  text,
  isFinished,
}: {
  text?: string;
  isFinished?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex justify-start mb-3 gap-2">
      <div className="w-8" />
      <div className="max-w-[75%]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
        >
          {isFinished ? (
            <CheckCircle size={12} />
          ) : (
            <Loader2 size={12} className="animate-spin" />
          )}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Thinking...
        </button>
        {expanded && text && (
          <div className="mt-1 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 text-xs text-purple-800 dark:text-purple-200 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallMessage({ chunk }: { chunk: AgentChunk }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = chunk.type === "tool_call_pending" && !chunk.is_finished;

  return (
    <div className="flex justify-start mb-2 gap-2">
      <div className="w-8" />
      <div className="max-w-[75%]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Wrench size={12} />
          )}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {chunk.tool_name || "tool_call"}
        </button>
        {expanded && chunk.tool_arguments && (
          <pre className="mt-1 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 text-xs text-gray-800 dark:text-gray-200 overflow-x-auto max-h-48 overflow-y-auto">
            {chunk.tool_arguments}
          </pre>
        )}
      </div>
    </div>
  );
}

function ToolResultMessage({ chunk }: { chunk: AgentChunk }) {
  const [expanded, setExpanded] = useState(false);
  const text = chunk.tool_result || chunk.result || chunk.text || "";

  return (
    <div className="flex justify-start mb-2 gap-2">
      <div className="w-8" />
      <div className="max-w-[75%]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
        >
          <CheckCircle size={12} />
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Tool Result
        </button>
        {expanded && text && (
          <pre className="mt-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs text-gray-800 dark:text-gray-200 overflow-x-auto max-h-48 overflow-y-auto">
            {text}
          </pre>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactMessage({
  chunk,
  onOpenArtifact,
}: {
  chunk: AgentChunk;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  const handleOpen = useCallback(() => {
    if (!onOpenArtifact) return;
    onOpenArtifact(chunkToArtifact(chunk));
  }, [chunk, onOpenArtifact]);

  return (
    <div className="flex justify-start mb-3 gap-2">
      <div className="w-8 h-8 shrink-0 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
        <FileDown size={16} className="text-violet-600 dark:text-violet-400" />
      </div>
      <button
        onClick={handleOpen}
        className="max-w-[75%] rounded-2xl rounded-bl-sm px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-left hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors cursor-pointer"
      >
        <p className="text-sm font-medium text-violet-800 dark:text-violet-200 truncate">
          {chunk.filename || "\u30D5\u30A1\u30A4\u30EB"}
        </p>
        <p className="text-xs text-violet-500 dark:text-violet-400 mt-0.5">
          {chunk.content_type}
          {chunk.size_bytes ? ` \u00B7 ${formatFileSize(chunk.size_bytes)}` : ""}
        </p>
      </button>
    </div>
  );
}

/** Highlight matching text within a string */
function highlightInText(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        className="bg-yellow-200/60 text-inherit rounded-sm"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
