import { useEffect, useState } from "react";

const STORAGE_KEY = "tachyon-cowork-global-custom-instructions";

function loadInitialValue(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function useGlobalCustomInstructions() {
  const [globalCustomInstructions, setGlobalCustomInstructions] =
    useState(loadInitialValue);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const trimmed = globalCustomInstructions.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, globalCustomInstructions);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [globalCustomInstructions]);

  return {
    globalCustomInstructions,
    setGlobalCustomInstructions,
  };
}
