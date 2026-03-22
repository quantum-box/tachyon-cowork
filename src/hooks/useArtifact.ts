import { useCallback, useState } from "react";
import { saveFile } from "../lib/tauri-bridge";
import type { AgentChunk, Artifact } from "../lib/types";

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
    if (contentType === "text/csv") return "csv";
    if (contentType === "text/html") return "html";
    if (contentType === "text/markdown") return "markdown";
  }
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    const extMap: Record<string, Artifact["type"]> = {
      xlsx: "excel",
      xls: "excel",
      pptx: "pptx",
      ppt: "pptx",
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
  };
  return map[type];
}

/** Convert an artifact SSE chunk into an Artifact */
export function chunkToArtifact(chunk: AgentChunk): Artifact {
  const type = inferArtifactType(chunk.content_type, chunk.filename);
  return {
    id: chunk.artifact_id || chunk.id,
    type,
    title: chunk.filename || "Artifact",
    content: chunk.content || "",
    url: chunk.url,
    createdAt: chunk.created_at,
  };
}

export function useArtifact() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
    null,
  );
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const addArtifact = useCallback((artifact: Artifact) => {
    setArtifacts((prev) => [...prev, artifact]);
  }, []);

  const openArtifact = useCallback((artifact: Artifact) => {
    setSelectedArtifact(artifact);
    setIsPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  const downloadArtifact = useCallback(async (artifact: Artifact) => {
    if (artifact.url) {
      try {
        const response = await fetch(artifact.url);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
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
  };
}
