import { useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, Download, Copy, Check, ChevronLeft, ChevronRight, History, Maximize2 } from "lucide-react";
import { useState } from "react";
import type { Artifact } from "../../lib/types";
import { CodeBlock } from "./CodeBlock";
import { MermaidDiagram } from "./MermaidDiagram";
import { HtmlPreview } from "./HtmlPreview";
import { PdfPreview } from "./PdfPreview";
import { DocxPreview } from "./DocxPreview";
import { CodeRunner } from "./CodeRunner";

type ArtifactPanelProps = {
  artifact: Artifact | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (artifact: Artifact) => void;
  onSwitchVersion?: (version: number) => void;
  onOpenCanvas?: (title: string, content: string, contentType: "html" | "jsx") => void;
};

function CsvTable({ content }: { content: string }) {
  const rows = useMemo(() => {
    return content
      .trim()
      .split("\n")
      .map((row) => row.split(",").map((cell) => cell.trim()));
  }, [content]);

  if (rows.length === 0) return null;

  const header = rows[0];
  const body = rows.slice(1);

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 dark:border-slate-600">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-left font-medium text-gray-700 dark:text-slate-300 text-xs"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr
              key={ri}
              className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border-b border-gray-100 dark:border-slate-700 px-3 py-1.5 text-gray-600 dark:text-slate-400"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none px-1 dark:prose-invert prose-headings:font-semibold prose-headings:text-gray-800 dark:prose-headings:text-slate-200 prose-h1:text-lg prose-h1:border-b prose-h1:border-gray-200 dark:prose-h1:border-slate-700 prose-h1:pb-2 prose-h2:text-base prose-h3:text-sm prose-p:text-gray-700 dark:prose-p:text-slate-300 prose-p:my-2 prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-800 dark:prose-strong:text-slate-200 prose-code:text-indigo-600 dark:prose-code:text-indigo-400 prose-code:bg-gray-100 dark:prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-transparent prose-pre:p-0 prose-blockquote:border-indigo-300 dark:prose-blockquote:border-indigo-600 prose-blockquote:bg-gray-50 dark:prose-blockquote:bg-slate-800/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-li:my-0.5 prose-table:text-sm prose-th:bg-gray-50 dark:prose-th:bg-slate-800 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-1.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !className;

            if (isInline) {
              return (
                <code {...props}>
                  {children}
                </code>
              );
            }

            const codeString = String(children).replace(/\n$/, "");
            const language = match?.[1] || "";

            if (language === "mermaid") {
              return <MermaidDiagram chart={codeString} />;
            }

            return <CodeBlock code={codeString} language={language} showDownload />;
          },
          pre({ children }) {
            return <>{children}</>;
          },
          input({ type, checked, ...props }) {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-1.5 accent-indigo-600 rounded"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-slate-600">
                <table className="w-full" {...props}>{children}</table>
              </div>
            );
          },
          hr() {
            return <hr className="my-4 border-gray-200 dark:border-slate-700" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ArtifactContent({ artifact }: { artifact: Artifact }) {
  switch (artifact.type) {
    case "code":
      return (
        <div>
          <CodeBlock
            code={artifact.content}
            language={artifact.language}
            showDownload
            filename={artifact.title}
          />
          {artifact.language && (
            <CodeRunner code={artifact.content} language={artifact.language} />
          )}
        </div>
      );
    case "markdown":
      return <MarkdownContent content={artifact.content} />;
    case "mermaid":
      return <MermaidDiagram chart={artifact.content} />;
    case "csv":
      return <CsvTable content={artifact.content} />;
    case "image":
      return (
        <div className="flex items-center justify-center p-4">
          <img
            src={artifact.url ?? `data:image/png;base64,${artifact.content}`}
            alt={artifact.title}
            className="max-w-full rounded-lg"
          />
        </div>
      );
    case "html":
      return <HtmlPreview content={artifact.content} title={artifact.title} />;
    case "pdf":
      return (
        <PdfPreview
          data={artifact.content ? JSON.parse(artifact.content) : null}
          title={artifact.title}
        />
      );
    case "docx":
      return (
        <DocxPreview
          data={artifact.content ? JSON.parse(artifact.content) : null}
          title={artifact.title}
        />
      );
    default:
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400 dark:text-slate-500">
          <p className="text-sm">
            このファイル形式のプレビューは対応していません
          </p>
        </div>
      );
  }
}

function VersionSelector({
  artifact,
  onSwitchVersion,
}: {
  artifact: Artifact;
  onSwitchVersion?: (version: number) => void;
}) {
  const versions = artifact.versions;
  const current = artifact.currentVersion ?? 1;

  if (!versions || versions.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
      <History size={12} className="shrink-0" />
      <button
        onClick={() => onSwitchVersion?.(Math.max(1, current - 1))}
        disabled={current <= 1}
        className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
      >
        <ChevronLeft size={12} />
      </button>
      <span className="tabular-nums font-medium min-w-[3rem] text-center">
        v{current} / {versions.length}
      </span>
      <button
        onClick={() => onSwitchVersion?.(Math.min(versions.length, current + 1))}
        disabled={current >= versions.length}
        className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
      >
        <ChevronRight size={12} />
      </button>
    </div>
  );
}

function canOpenInCanvas(artifact: Artifact): boolean {
  return artifact.type === "html" || artifact.type === "jsx";
}

export function ArtifactPanel({
  artifact,
  isOpen,
  onClose,
  onDownload,
  onSwitchVersion,
  onOpenCanvas,
}: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!artifact) return;
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact]);

  return (
    <div
      className={`shrink-0 h-full border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
        isOpen ? "w-[480px]" : "w-0 border-l-0"
      }`}
    >
      {artifact && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-4 py-3">
            <div className="flex-1 min-w-0 mr-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                {artifact.title}
              </h3>
              {artifact.type !== "image" && (
                <span className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  {artifact.type}
                  {artifact.language ? ` · ${artifact.language}` : ""}
                </span>
              )}
            </div>
            {artifact && canOpenInCanvas(artifact) && onOpenCanvas && (
              <button
                onClick={() =>
                  onOpenCanvas(
                    artifact.title,
                    artifact.content,
                    artifact.type as "html" | "jsx",
                  )
                }
                className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="キャンバスで開く"
                title="キャンバスで開く"
              >
                <Maximize2 size={16} className="text-gray-500 dark:text-slate-400" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="パネルを閉じる"
            >
              <X size={16} className="text-gray-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            <ArtifactContent artifact={artifact} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDownload(artifact)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
              >
                <Download size={14} />
                ダウンロード
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    コピー済み!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    コピー
                  </>
                )}
              </button>
            </div>
            <VersionSelector
              artifact={artifact}
              onSwitchVersion={onSwitchVersion}
            />
          </div>
        </>
      )}
    </div>
  );
}
