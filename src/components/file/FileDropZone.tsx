import { useCallback, useState, type DragEvent, type ReactNode } from "react";
import { Paperclip } from "lucide-react";

type FileDropZoneProps = {
  children: ReactNode;
  onFilesDropped: (files: FileList) => void;
};

export function FileDropZone({ children, onFilesDropped }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useState({ current: 0 })[0];

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragging(true);
      }
    },
    [dragCounter],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current -= 1;
      if (dragCounter.current === 0) {
        setIsDragging(false);
      }
    },
    [dragCounter],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        onFilesDropped(e.dataTransfer.files);
      }
    },
    [dragCounter, onFilesDropped],
  );

  return (
    <div
      className="relative h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-500/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-indigo-400 bg-white/80 px-12 py-10">
            <Paperclip size={32} className="text-indigo-500" />
            <p className="text-sm font-medium text-indigo-700">
              ファイルをドロップして添付
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
