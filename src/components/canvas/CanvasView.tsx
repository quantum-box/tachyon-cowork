import { useCallback, useState } from "react";
import { X, GripVertical } from "lucide-react";
import { CanvasPreview } from "./CanvasPreview";

type Props = {
  title: string;
  content: string;
  contentType: "html" | "jsx";
  onClose: () => void;
};

export function CanvasView({
  title,
  content,
  contentType,
  onClose,
}: Props) {
  const [width, setWidth] = useState(560);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const startX = e.clientX;
      const startWidth = width;

      const handleMove = (ev: MouseEvent) => {
        // Dragging left increases width, dragging right decreases
        const delta = startX - ev.clientX;
        setWidth(Math.min(1200, Math.max(320, startWidth + delta)));
      };
      const handleUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [width],
  );

  return (
    <div
      className="shrink-0 h-full flex"
      style={isDragging ? { userSelect: "none" } : undefined}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="shrink-0 w-1.5 cursor-col-resize flex items-center justify-center border-l border-gray-200 dark:border-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors group"
      >
        <GripVertical
          size={12}
          className="text-gray-300 dark:text-slate-600 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {/* Panel */}
      <div
        className="h-full bg-white dark:bg-slate-950 flex flex-col"
        style={{ width: `${width}px` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
              {title}
            </h2>
            <span className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider shrink-0">
              {contentType}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="キャンバスを閉じる"
          >
            <X size={16} className="text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 min-h-0 p-2">
          <CanvasPreview
            content={content}
            contentType={contentType}
            title={title}
          />
        </div>
      </div>
    </div>
  );
}
