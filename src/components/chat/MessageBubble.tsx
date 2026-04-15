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
  PanelRightOpen,
} from "lucide-react";
import type { AgentChunk, Artifact } from "../../lib/types";
import {
  chunkToArtifact,
  isFileWriteTool,
  fileWriteToArtifact,
} from "../../hooks/useArtifact";
import { CodeBlock } from "../artifact/CodeBlock";
import { MermaidDiagram } from "../artifact/MermaidDiagram";

type Props = {
  chunk: AgentChunk;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOptionSelect?: (option: string) => void;
  onOpenCanvas?: (
    title: string,
    content: string,
    contentType: "html" | "jsx",
  ) => void;
  searchQuery?: string;
};

export function MessageBubble({
  chunk,
  onOpenArtifact,
  onOptionSelect,
  onOpenCanvas,
  searchQuery,
}: Props) {
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
      return (
        <ToolCallMessage
          chunk={chunk}
          onOpenCanvas={onOpenCanvas}
          onOpenArtifact={onOpenArtifact}
        />
      );
    case "tool_result":
      return <ToolResultMessage chunk={chunk} />;
    case "usage":
      return null;
    case "tool_job_started":
      return (
        <div className="flex justify-start mb-2">
          <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-400">
            Tool Job: {chunk.provider || "unknown"} ({chunk.job_id?.slice(0, 8)}
            ...)
          </div>
        </div>
      );
    case "artifact":
      return <ArtifactMessage chunk={chunk} onOpenArtifact={onOpenArtifact} />;
    case "ask":
      return (
        <div className="flex justify-start mb-3">
          <div className="max-w-[80%] rounded-[22px] border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-stone-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-stone-100">
            <p className="font-medium mb-2">{chunk.text}</p>
            {chunk.options && (
              <div className="flex flex-wrap gap-2">
                {chunk.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onOptionSelect?.(opt)}
                    className="rounded-xl border border-amber-200 bg-white/70 px-2.5 py-1 text-xs text-amber-800 transition-colors cursor-pointer hover:bg-white dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/35"
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
        <div className="max-w-[75%] rounded-[22px] rounded-br-md border border-stone-300/80 bg-stone-200/80 px-4 py-3 text-sm leading-relaxed text-stone-800 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-stone-700 dark:bg-stone-800/90 dark:text-stone-100">
          {/* Image thumbnails */}
          {hasImages && (
            <div className="flex flex-wrap gap-2 mb-2">
              {imageUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxUrl(url)}
                  className="group relative overflow-hidden rounded-xl ring-1 ring-stone-300/70 transition-all hover:ring-stone-400 dark:ring-stone-700 dark:hover:ring-stone-500"
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
          <User size={16} />
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
    <div className="group/msg mb-8">
      <div className="max-w-none text-[15px] leading-7 prose prose-sm prose-p:my-1 prose-pre:bg-transparent prose-pre:p-0 prose-code:text-sky-700 dark:prose-code:text-sky-300 prose-code:before:content-[''] prose-code:after:content-[''] text-stone-800 dark:text-stone-100 prose-headings:text-stone-900 dark:prose-headings:text-stone-100 prose-strong:text-stone-900 dark:prose-strong:text-stone-100 prose-a:text-sky-700 dark:prose-a:text-sky-300">
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
                    className="rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-mono text-sky-700 dark:bg-stone-800 dark:text-sky-300"
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
                <div className="my-3 overflow-x-auto rounded-xl border border-stone-200/80 dark:border-stone-700/80">
                  <table className="min-w-full divide-y divide-stone-200 text-xs dark:divide-stone-700">
                    {children}
                  </table>
                </div>
              );
            },
            thead({ children }) {
              return (
                <thead className="bg-stone-50/80 dark:bg-stone-900/70">
                  {children}
                </thead>
              );
            },
            th({ children }) {
              return (
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-stone-700 dark:text-stone-300">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="border-t border-stone-100 px-3 py-2 text-stone-700 dark:border-stone-800 dark:text-stone-300">
                  {children}
                </td>
              );
            },
            blockquote({ children }) {
              return (
                <blockquote className="my-2 border-l-[3px] border-stone-300 pl-3 italic text-stone-500 dark:border-stone-700 dark:text-stone-400">
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
                  className="text-sky-700 hover:underline dark:text-sky-300"
                >
                  {children}
                </a>
              );
            },
            ul({ children }) {
              return (
                <ul className="my-1.5 ml-4 list-disc space-y-0.5 marker:text-stone-400 dark:marker:text-stone-500">
                  {children}
                </ul>
              );
            },
            ol({ children }) {
              return (
                <ol className="my-1.5 ml-4 list-decimal space-y-0.5 marker:text-stone-400 dark:marker:text-stone-500">
                  {children}
                </ol>
              );
            },
            hr() {
              return (
                <hr className="my-4 border-stone-200 dark:border-stone-800" />
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
            className="notion-button px-2.5 py-1 text-xs"
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
              className="rounded-xl border border-stone-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-white hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:bg-stone-900"
            >
              <Code size={12} />
              Artifactで開く
              {codeBlocks.length > 1 && (
                <span className="text-stone-400 dark:text-stone-500">
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
          className="flex items-center gap-1.5 text-xs text-stone-500 transition-colors hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
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
          <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallMessage({
  chunk,
  onOpenCanvas,
  onOpenArtifact,
}: {
  chunk: AgentChunk;
  onOpenCanvas?: (
    title: string,
    content: string,
    contentType: "html" | "jsx",
  ) => void;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPending = chunk.type === "tool_call_pending" && !chunk.is_finished;
  const isCanvas = chunk.tool_name === "canvas";
  const isFileWrite = isFileWriteTool(chunk.tool_name || "");

  const handleOpenCanvas = useCallback(() => {
    if (!onOpenCanvas || !chunk.args) return;
    const args = chunk.args as {
      title?: string;
      content?: string;
      content_type?: "html" | "jsx";
    };
    onOpenCanvas(
      args.title || "Canvas",
      args.content || "",
      args.content_type || "html",
    );
  }, [onOpenCanvas, chunk.args]);

  const handleOpenFileArtifact = useCallback(() => {
    if (!onOpenArtifact || !chunk.tool_arguments) return;
    const artifact = fileWriteToArtifact(
      chunk.tool_id || chunk.id,
      chunk.tool_arguments,
      chunk.created_at,
    );
    if (artifact) onOpenArtifact(artifact);
  }, [
    onOpenArtifact,
    chunk.tool_id,
    chunk.id,
    chunk.tool_arguments,
    chunk.created_at,
  ]);

  return (
    <div className="flex justify-start mb-2 gap-2">
      <div className="w-8" />
      <div className="max-w-[75%]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs text-stone-500 transition-colors hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            {isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Wrench size={12} />
            )}
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {chunk.tool_name || "tool_call"}
          </button>
          {isCanvas && !isPending && onOpenCanvas && chunk.args && (
            <button
              onClick={handleOpenCanvas}
              className="rounded-xl border border-stone-200 bg-white/80 px-2 py-1 text-xs text-stone-700 transition-colors hover:bg-white dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:bg-stone-900"
            >
              <PanelRightOpen size={12} />
              Canvasを開く
            </button>
          )}
          {isFileWrite &&
            !isPending &&
            onOpenArtifact &&
            chunk.tool_arguments && (
              <button
                onClick={handleOpenFileArtifact}
                className="rounded-xl border border-stone-200 bg-white/80 px-2 py-1 text-xs text-stone-700 transition-colors hover:bg-white dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:bg-stone-900"
              >
                <PanelRightOpen size={12} />
                Artifactで開く
              </button>
            )}
        </div>
        {expanded && chunk.tool_arguments && (
          <pre className="mt-2 max-h-48 overflow-x-auto overflow-y-auto rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200">
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
          className="flex items-center gap-1.5 text-xs text-stone-500 transition-colors hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          <CheckCircle size={12} />
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Tool Result
        </button>
        {expanded && text && (
          <pre className="mt-2 max-h-48 overflow-x-auto overflow-y-auto rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200">
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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
        <FileDown size={16} />
      </div>
      <button
        onClick={handleOpen}
        className="max-w-[75%] cursor-pointer rounded-[22px] rounded-bl-md border border-stone-200 bg-white/80 px-4 py-3 text-left transition-colors hover:bg-white dark:border-stone-700 dark:bg-stone-900/70 dark:hover:bg-stone-900"
      >
        <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
          {chunk.filename || "\u30D5\u30A1\u30A4\u30EB"}
        </p>
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
          {chunk.content_type}
          {chunk.size_bytes
            ? ` \u00B7 ${formatFileSize(chunk.size_bytes)}`
            : ""}
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
      <mark key={i} className="bg-yellow-200/60 text-inherit rounded-sm">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
