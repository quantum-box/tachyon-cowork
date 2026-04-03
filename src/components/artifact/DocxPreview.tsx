import { FileText } from "lucide-react";
import type { DocxData } from "../../lib/types";

type DocxPreviewProps = {
  data: DocxData | null;
  title?: string;
};

const styleToHeading: Record<string, string> = {
  Heading1: "text-xl font-bold",
  Heading2: "text-lg font-semibold",
  Heading3: "text-base font-semibold",
  Heading4: "text-sm font-semibold",
  Title: "text-2xl font-bold",
  Subtitle: "text-lg text-gray-500 dark:text-slate-400",
};

export function DocxPreview({ data, title: _title }: DocxPreviewProps) {
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400 dark:text-slate-500">
        <FileText size={32} />
        <p className="text-sm">DOCXデータがありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Metadata */}
      {(data.metadata.title || data.metadata.author) && (
        <div className="text-xs text-gray-500 dark:text-slate-400 space-y-0.5 pb-2 border-b border-gray-200 dark:border-slate-700">
          {data.metadata.title && <div>Title: {data.metadata.title}</div>}
          {data.metadata.author && <div>Author: {data.metadata.author}</div>}
        </div>
      )}

      {/* Paragraphs */}
      <div className="space-y-2">
        {data.paragraphs.map((para, i) => {
          const headingClass = para.style ? styleToHeading[para.style] : undefined;
          return (
            <p
              key={i}
              className={`text-sm text-gray-700 dark:text-slate-300 leading-relaxed ${headingClass || ""}`}
            >
              {para.text}
            </p>
          );
        })}
      </div>

      {/* Tables */}
      {data.tables.map((table, ti) => (
        <div
          key={ti}
          className="overflow-auto rounded-lg border border-gray-200 dark:border-slate-600"
        >
          <table className="w-full text-sm border-collapse">
            {table.rows.length > 0 && (
              <thead>
                <tr>
                  {table.rows[0].map((cell, ci) => (
                    <th
                      key={ci}
                      className="border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-left font-medium text-gray-700 dark:text-slate-300 text-xs"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {table.rows.slice(1).map((row, ri) => (
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
      ))}

      {data.paragraphs.length === 0 && data.tables.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400 dark:text-slate-500">
          <p className="text-sm">コンテンツがありません</p>
        </div>
      )}
    </div>
  );
}
