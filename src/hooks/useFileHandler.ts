import { useCallback, useState } from "react";
import type { FileAttachment } from "../lib/types";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generatePreview(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(file);
  });
}

export function useFileHandler() {
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const addFiles = useCallback(async (fileList: FileList) => {
    setFileError(null);
    const newAttachments: FileAttachment[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > MAX_FILE_SIZE) {
        setFileError(
          `「${file.name}」は${formatFileSize(MAX_FILE_SIZE)}を超えています`,
        );
        continue;
      }
      const arrayBuffer = await file.arrayBuffer();
      const preview = await generatePreview(file);
      newAttachments.push({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        data: new Uint8Array(arrayBuffer),
        preview,
      });
    }

    if (newAttachments.length > 0) {
      setFiles((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setFileError(null);
  }, []);

  return { files, fileError, addFiles, removeFile, clearFiles };
}
