import {
  X,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
} from "lucide-react";
import type { FileAttachment } from "../../lib/types";

type FilePreviewProps = {
  files: FileAttachment[];
  onRemove: (id: string) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return ImageIcon;
  if (
    type.includes("spreadsheet") ||
    type.includes("excel") ||
    type === "text/csv"
  )
    return FileSpreadsheet;
  if (
    type.includes("pdf") ||
    type.includes("document") ||
    type.includes("text")
  )
    return FileText;
  return FileIcon;
}

export function FilePreview({ files, onRemove }: FilePreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {files.map((file) => {
        const Icon = getFileIcon(file.type);
        return (
          <div
            key={file.id}
            className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300"
          >
            {file.preview ? (
              <img
                src={file.preview}
                alt={file.name}
                className="h-6 w-6 rounded object-cover"
              />
            ) : (
              <Icon size={14} className="shrink-0 text-gray-400 dark:text-slate-500" />
            )}
            <span className="max-w-[120px] truncate">{file.name}</span>
            <span className="text-gray-400 dark:text-slate-500">{formatSize(file.size)}</span>
            <button
              type="button"
              onClick={() => onRemove(file.id)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
              aria-label={`${file.name}を削除`}
            >
              <X size={12} className="text-gray-500 dark:text-slate-400" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
