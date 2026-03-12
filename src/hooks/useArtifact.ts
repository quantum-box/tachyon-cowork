import { useCallback, useState } from "react";
import { saveFile } from "../lib/tauri-bridge";
import type { Artifact } from "../lib/types";

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
    // Keep selectedArtifact so the slide-out animation shows content
  }, []);

  const downloadArtifact = useCallback(async (artifact: Artifact) => {
    if (artifact.url) {
      // If there's a URL, open it
      window.open(artifact.url, "_blank");
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
