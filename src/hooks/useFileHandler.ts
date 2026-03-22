import { useCallback, useState } from "react";
import type { FileAttachment, InlineAttachment } from "../lib/types";
import {
  isVisionAttachment,
  getVisionValidationError,
} from "../lib/vision";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
    const warnings: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > MAX_FILE_SIZE) {
        warnings.push(
          `「${file.name}」は${formatFileSize(MAX_FILE_SIZE)}を超えています`,
        );
        continue;
      }

      // Vision-specific validation for image files
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        const visionError = getVisionValidationError({
          type: file.type,
          name: file.name,
          size: file.size,
        });
        if (visionError) {
          warnings.push(visionError);
          continue;
        }
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
        isVision: isVisionAttachment({
          type: file.type,
          name: file.name,
          size: file.size,
        }),
      });
    }

    if (warnings.length > 0) {
      setFileError(warnings.join("\n"));
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

  /** Convert current files to InlineAttachment[] for the API request */
  const toInlineAttachments = useCallback((): InlineAttachment[] => {
    return files
      .filter((f) => f.data)
      .map((f) => ({
        filename: f.name,
        content_type: f.type || "application/octet-stream",
        data: uint8ArrayToBase64(f.data!),
      }));
  }, [files]);

  /** Check if any attached file is a vision image */
  const hasVisionImages = files.some((f) => f.isVision);

  return {
    files,
    fileError,
    hasVisionImages,
    addFiles,
    removeFile,
    clearFiles,
    toInlineAttachments,
  };
}
