import { useCallback, useState } from "react";
import { saveFile, readWorkspaceFile } from "../lib/tauri-bridge";
import type {
  AgentChunk,
  Artifact,
  ArtifactVersion,
  WorkspaceFile,
} from "../lib/types";

/** Infer a language hint for syntax highlighting from a filename */
function inferLanguage(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  const langMap: Record<string, string> = {
    py: "python",
    js: "javascript",
    ts: "typescript",
    jsx: "jsx",
    tsx: "tsx",
    rs: "rust",
    go: "go",
    java: "java",
    rb: "ruby",
    css: "css",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "bash",
    sql: "sql",
    xml: "xml",
    c: "c",
    cpp: "cpp",
    txt: "text",
  };
  return langMap[ext];
}

/** Tool names that create/overwrite files on the server side */
const FILE_WRITE_TOOLS = new Set(["write_to_file", "create_file"]);

/** Check if a tool name is a file-writing tool */
export function isFileWriteTool(toolName: string): boolean {
  return FILE_WRITE_TOOLS.has(toolName);
}

/** Create an Artifact from a write_to_file tool call's arguments */
export function fileWriteToArtifact(
  toolId: string,
  toolArguments: string,
  timestamp: string,
): Artifact | null {
  try {
    const args = JSON.parse(toolArguments);
    const filePath: string = args.path || args.file_path || "";
    const content: string = args.content ?? "";
    if (!filePath) return null;

    const filename = filePath.split("/").pop() || "file";
    const type = inferArtifactType(undefined, filename);
    const language = type === "code" ? inferLanguage(filename) : undefined;

    return {
      id: `file-${toolId}`,
      type,
      title: filename,
      content,
      language,
      createdAt: timestamp,
      versions: [{ version: 1, content, createdAt: timestamp }],
      currentVersion: 1,
    };
  } catch {
    return null;
  }
}

/** Map content_type from SSE to Artifact type */
function inferArtifactType(
  contentType?: string,
  filename?: string,
): Artifact["type"] {
  if (contentType) {
    if (contentType.startsWith("image/")) return "image";
    if (contentType === "application/pdf") return "pdf";
    if (
      contentType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      contentType === "application/vnd.ms-excel"
    )
      return "excel";
    if (
      contentType ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      contentType === "application/vnd.ms-powerpoint"
    )
      return "pptx";
    if (
      contentType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      contentType === "application/msword"
    )
      return "docx";
    if (contentType === "text/csv") return "csv";
    if (contentType === "text/html") return "html";
    if (contentType === "text/jsx") return "jsx";
    if (contentType === "text/markdown") return "markdown";
  }
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    const extMap: Record<string, Artifact["type"]> = {
      xlsx: "excel",
      xls: "excel",
      pptx: "pptx",
      ppt: "pptx",
      docx: "docx",
      doc: "docx",
      pdf: "pdf",
      png: "image",
      jpg: "image",
      jpeg: "image",
      gif: "image",
      webp: "image",
      svg: "image",
      csv: "csv",
      html: "html",
      htm: "html",
      jsx: "jsx",
      tsx: "jsx",
      md: "markdown",
      mmd: "mermaid",
    };
    if (ext && ext in extMap) return extMap[ext];
  }
  return "code";
}

function extensionForType(type: Artifact["type"]): string {
  const map: Record<Artifact["type"], string> = {
    code: "txt",
    excel: "xlsx",
    pptx: "pptx",
    pdf: "pdf",
    image: "png",
    markdown: "md",
    mermaid: "mmd",
    csv: "csv",
    html: "html",
    jsx: "jsx",
    docx: "docx",
  };
  return map[type];
}

/** Convert an artifact SSE chunk into an Artifact */
export function chunkToArtifact(chunk: AgentChunk): Artifact {
  const type = inferArtifactType(chunk.content_type, chunk.filename);
  const now = chunk.created_at;
  return {
    id: chunk.artifact_id || chunk.id,
    type,
    title: chunk.filename || "Artifact",
    content: chunk.content || "",
    url: chunk.url,
    createdAt: now,
    versions: [{ version: 1, content: chunk.content || "", createdAt: now }],
    currentVersion: 1,
  };
}

/** Create Artifact entries for files persisted in a sandbox workspace */
export function workspaceFilesToArtifacts(
  workspaceId: string,
  files: WorkspaceFile[],
  timestamp: string,
): Artifact[] {
  return files
    .filter((f) => !f.is_dir)
    .map((f) => {
      const type = inferArtifactType(undefined, f.name);
      const language = type === "code" ? inferLanguage(f.name) : undefined;
      return {
        id: `ws-${workspaceId}-${f.name}`,
        type,
        title: f.name,
        content: "",
        language,
        createdAt: timestamp,
        versions: [{ version: 1, content: "", createdAt: timestamp }],
        currentVersion: 1,
        workspace: { workspaceId, filename: f.name },
      };
    });
}

export type CanvasState = {
  isOpen: boolean;
  title: string;
  content: string;
  contentType: "html" | "jsx";
};

export function useArtifact() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
    null,
  );
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [canvas, setCanvas] = useState<CanvasState>({
    isOpen: false,
    title: "",
    content: "",
    contentType: "html",
  });

  const addArtifact = useCallback((artifact: Artifact) => {
    // Ensure versioning fields are set
    const versioned: Artifact = {
      ...artifact,
      versions: artifact.versions ?? [
        {
          version: 1,
          content: artifact.content,
          createdAt: artifact.createdAt,
        },
      ],
      currentVersion: artifact.currentVersion ?? 1,
    };

    setArtifacts((prev) => {
      // If artifact with same id already exists, add as new version
      const existingIdx = prev.findIndex((a) => a.id === versioned.id);
      if (existingIdx !== -1) {
        const existing = prev[existingIdx];
        const newVersion = (existing.versions?.length ?? 0) + 1;
        const newVersionEntry: ArtifactVersion = {
          version: newVersion,
          content: versioned.content,
          createdAt: versioned.createdAt,
        };
        const updated: Artifact = {
          ...existing,
          content: versioned.content,
          versions: [...(existing.versions ?? []), newVersionEntry],
          currentVersion: newVersion,
        };
        const next = [...prev];
        next[existingIdx] = updated;
        return next;
      }
      return [...prev, versioned];
    });
  }, []);

  const openArtifact = useCallback((artifact: Artifact) => {
    // Ensure versioning fields
    const versioned: Artifact = {
      ...artifact,
      versions: artifact.versions ?? [
        {
          version: 1,
          content: artifact.content,
          createdAt: artifact.createdAt,
        },
      ],
      currentVersion: artifact.currentVersion ?? 1,
    };
    setSelectedArtifact(versioned);
    setIsPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  const openCanvas = useCallback(
    (title: string, content: string, contentType: "html" | "jsx") => {
      setCanvas({ isOpen: true, title, content, contentType });
      setIsPanelOpen(false);
    },
    [],
  );

  const closeCanvas = useCallback(() => {
    setCanvas((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  const updateCanvasContent = useCallback((content: string) => {
    setCanvas((prev) =>
      prev.content === content ? prev : { ...prev, content },
    );
  }, []);

  /** Switch to a specific version of the selected artifact */
  const switchVersion = useCallback((version: number) => {
    setSelectedArtifact((prev) => {
      if (!prev || !prev.versions) return prev;
      const v = prev.versions.find((ver) => ver.version === version);
      if (!v) return prev;
      return { ...prev, content: v.content, currentVersion: version };
    });
  }, []);

  const downloadArtifact = useCallback(async (artifact: Artifact) => {
    // Workspace file: read from sandbox workspace via Tauri command
    if (artifact.workspace) {
      try {
        const bytes = await readWorkspaceFile(
          artifact.workspace.workspaceId,
          artifact.workspace.filename,
        );
        await saveFile(bytes, artifact.workspace.filename);
      } catch (e) {
        console.error("Workspace file download failed:", e);
      }
      return;
    }
    if (artifact.url) {
      try {
        const response = await fetch(artifact.url);
        if (!response.ok)
          throw new Error(`Download failed: ${response.status}`);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = artifact.title;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch (e) {
        console.error("Artifact download failed, falling back to new tab:", e);
        window.open(artifact.url, "_blank");
      }
      return;
    }
    const ext = artifact.language
      ? artifact.language
      : extensionForType(artifact.type);
    const filename = `${artifact.title}.${ext}`;
    await saveFile(artifact.content, filename);
  }, []);

  return {
    artifacts,
    selectedArtifact,
    isPanelOpen,
    addArtifact,
    openArtifact,
    closePanel,
    downloadArtifact,
    switchVersion,
    canvas,
    openCanvas,
    closeCanvas,
    updateCanvasContent,
  };
}
