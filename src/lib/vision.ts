/** Vision / multimodal image support constants and helpers */

/** MIME types supported by the vision API */
export const VISION_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** File extensions accepted for vision */
export const VISION_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
]);

/** Maximum image size for vision (20 MB) */
export const VISION_MAX_SIZE = 20 * 1024 * 1024;

/** Check if a MIME type is a vision-supported image */
export function isVisionMimeType(mimeType: string): boolean {
  return VISION_MIME_TYPES.has(mimeType.toLowerCase());
}

/** Check if a filename has a vision-supported extension */
export function isVisionFilename(filename: string): boolean {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  return ext ? VISION_EXTENSIONS.has(ext) : false;
}

/** Check if an attachment qualifies as a vision image */
export function isVisionAttachment(file: {
  type: string;
  name: string;
  size: number;
}): boolean {
  return (
    (isVisionMimeType(file.type) || isVisionFilename(file.name)) &&
    file.size <= VISION_MAX_SIZE
  );
}

/** Get a human-readable label for vision validation errors */
export function getVisionValidationError(file: {
  type: string;
  name: string;
  size: number;
}): string | null {
  if (!isVisionMimeType(file.type) && !isVisionFilename(file.name)) {
    return `「${file.name}」は画像認識に非対応のフォーマットです（対応: JPEG, PNG, GIF, WebP）`;
  }
  if (file.size > VISION_MAX_SIZE) {
    return `「${file.name}」は画像認識の上限（20MB）を超えています`;
  }
  return null;
}
