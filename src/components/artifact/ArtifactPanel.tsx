import { useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, Download, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { Artifact } from "../../lib/types";
import { CodeBlock } from "./CodeBlock";

type ArtifactPanelProps = {
  artifact: Artifact | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (artifact: Artifact) => void;
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
    <div className="overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="border border-gray-300 bg-gray-100 px-3 py-1.5 text-left font-medium text-gray-700"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border border-gray-200 px-3 py-1.5 text-gray-600"
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

function ArtifactContent({
  artifact,
}: {
  artifact: Artifact;
}) {
  switch (artifact.type) {
    case "code":
      return <CodeBlock code={artifact.content} language={artifact.language} />;
    case "markdown":
      return (
        <div className="prose prose-sm max-w-none px-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {artifact.content}
          </ReactMarkdown>
        </div>
      );
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
      return (
        <iframe
          srcDoc={artifact.content}
          sandbox="allow-scripts"
          title={artifact.title}
          className="h-full w-full min-h-[400px] border-0 rounded"
        />
      );
    default:
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400">
          <p className="text-sm">
            このファイル形式のプレビューは対応していません
          </p>
        </div>
      );
  }
}

export function ArtifactPanel({
  artifact,
  isOpen,
  onClose,
  onDownload,
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
      className={`shrink-0 h-full border-l border-gray-200 bg-white flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
        isOpen ? "w-96" : "w-0 border-l-0"
      }`}
    >
      {artifact && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800 truncate">
              {artifact.title}
            </h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors"
              aria-label="パネルを閉じる"
            >
              <X size={16} className="text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            <ArtifactContent artifact={artifact} />
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-gray-200 px-4 py-3">
            <button
              onClick={() => onDownload(artifact)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <Download size={14} />
              ダウンロード
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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
        </>
      )}
    </div>
  );
}
