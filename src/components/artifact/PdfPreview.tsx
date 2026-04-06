import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import type { PdfData } from "../../lib/types";

type PdfPreviewProps = {
  data: PdfData | null;
  title?: string;
};

export function PdfPreview({ data, title: _title }: PdfPreviewProps) {
  const [currentPage, setCurrentPage] = useState(1);

  if (!data || data.pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400 dark:text-slate-500">
        <FileText size={32} />
        <p className="text-sm">PDFデータがありません</p>
      </div>
    );
  }

  const page = data.pages[currentPage - 1];

  return (
    <div className="flex flex-col gap-3">
      {/* Metadata */}
      {(data.metadata.title || data.metadata.author) && (
        <div className="text-xs text-gray-500 dark:text-slate-400 space-y-0.5">
          {data.metadata.title && <div>Title: {data.metadata.title}</div>}
          {data.metadata.author && <div>Author: {data.metadata.author}</div>}
        </div>
      )}

      {/* Page navigation */}
      <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 rounded-lg px-3 py-2">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs text-gray-600 dark:text-slate-300 tabular-nums">
          {currentPage} / {data.page_count}
        </span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(data.page_count, p + 1))}
          disabled={currentPage >= data.page_count}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Page content */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-4 min-h-[200px]">
        <pre className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
          {page?.text || "(このページにテキストはありません)"}
        </pre>
      </div>
    </div>
  );
}
