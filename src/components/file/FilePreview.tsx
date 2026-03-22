import { useState, useCallback } from "react";
import {
  X,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
  Eye,
  ZoomIn,
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const closeLightbox = useCallback(() => setLightboxUrl(null), []);

  if (files.length === 0) return null;

  const imageFiles = files.filter((f) => f.preview);
  const otherFiles = files.filter((f) => !f.preview);

  return (
    <>
      <div className="flex flex-wrap gap-2 px-4 pb-2">
        {/* Image thumbnails — larger preview */}
        {imageFiles.map((file) => (
          <div
            key={file.id}
            className="group relative rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 overflow-hidden"
          >
            <img
              src={file.preview}
              alt={file.name}
              className="h-20 w-20 object-cover cursor-pointer"
              onClick={() => setLightboxUrl(file.preview!)}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
              <ZoomIn
                size={20}
                className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
            {/* Vision badge */}
            {file.isVision && (
              <div className="absolute bottom-0 left-0 right-0 bg-indigo-600/80 px-1 py-0.5 text-[9px] text-white text-center font-medium flex items-center justify-center gap-0.5">
                <Eye size={8} />
                Vision
              </div>
            )}
            {/* File info */}
            <div className="px-1.5 py-1 text-[10px] text-gray-500 dark:text-slate-400 truncate max-w-[80px]">
              {file.name}
            </div>
            {/* Remove button */}
            <button
              type="button"
              onClick={() => onRemove(file.id)}
              className="absolute top-1 right-1 rounded-full bg-black/50 p-0.5 text-white opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all"
              aria-label={`${file.name}を削除`}
            >
              <X size={12} />
            </button>
          </div>
        ))}

        {/* Non-image file chips */}
        {otherFiles.map((file) => {
          const Icon = getFileIcon(file.type);
          return (
            <div
              key={file.id}
              className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300"
            >
              <Icon size={14} className="shrink-0 text-gray-400 dark:text-slate-500" />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <span className="text-gray-400 dark:text-slate-500">
                {formatSize(file.size)}
              </span>
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

      {/* Lightbox modal */}
      {lightboxUrl && (
        <ImageLightbox url={lightboxUrl} onClose={closeLightbox} />
      )}
    </>
  );
}

/** Full-screen image lightbox */
function ImageLightbox({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="画像プレビュー"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
        aria-label="閉じる"
      >
        <X size={24} />
      </button>
      <img
        src={url}
        alt="プレビュー"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/** Standalone lightbox component for use in MessageBubble */
export { ImageLightbox };
