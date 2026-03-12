/**
 * Platform abstraction for Tauri / Web file operations.
 */

/** Detect whether we are running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/** Read a local file via the Tauri FS plugin. Throws on web. */
export async function readLocalFile(path: string): Promise<Uint8Array> {
  if (!isTauri()) {
    throw new Error("readLocalFile is only available in Tauri");
  }
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return readFile(path);
}

export type SaveFileOptions = {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
};

/** Save binary data to disk. Tauri: uses dialog + fs. Web: Blob download. */
export async function saveFile(
  data: Uint8Array | string,
  name: string,
  options?: SaveFileOptions,
): Promise<void> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: options?.defaultPath ?? name,
      filters: options?.filters,
    });
    if (path) {
      const bytes =
        typeof data === "string" ? new TextEncoder().encode(data) : data;
      await writeFile(path, bytes);
    }
    return;
  }

  // Web fallback – create a temporary download link
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: "text/plain" })
      : new Blob([data.buffer as ArrayBuffer]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type PickFilesOptions = {
  multiple?: boolean;
  accept?: string[];
};

/** Open a file picker and return a FileList. */
export async function pickFiles(
  options?: PickFilesOptions,
): Promise<FileList | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");

    const selected = await open({
      multiple: options?.multiple ?? true,
      filters: options?.accept
        ? [{ name: "Files", extensions: options.accept }]
        : undefined,
    });
    if (!selected) return null;

    const paths = Array.isArray(selected) ? selected : [selected];
    const dt = new DataTransfer();
    for (const p of paths) {
      const bytes = await readFile(p);
      const name = p.split(/[/\\]/).pop() ?? "file";
      const file = new File([bytes], name);
      dt.items.add(file);
    }
    return dt.files;
  }

  // Web fallback – use an invisible <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options?.multiple ?? true;
    if (options?.accept) {
      input.accept = options.accept.join(",");
    }
    input.onchange = () => resolve(input.files);
    input.click();
  });
}
