import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tachyon-cowork.max-requests";
const DEFAULT_MAX_REQUESTS = 10;
const MIN_MAX_REQUESTS = 1;
const MAX_MAX_REQUESTS = 100;

function clampMaxRequests(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_REQUESTS;
  }

  return Math.min(Math.max(value, MIN_MAX_REQUESTS), MAX_MAX_REQUESTS);
}

function loadInitialValue(): number {
  if (typeof window === "undefined") {
    return DEFAULT_MAX_REQUESTS;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return DEFAULT_MAX_REQUESTS;
  }

  const parsed = Number.parseInt(stored, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_MAX_REQUESTS;
  }

  return clampMaxRequests(parsed);
}

export function useMaxRequests() {
  const [maxRequests, setMaxRequestsValue] = useState(loadInitialValue);

  const setMaxRequests = useCallback((value: number) => {
    setMaxRequestsValue(clampMaxRequests(value));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(STORAGE_KEY, String(maxRequests));
  }, [maxRequests]);

  return {
    maxRequests,
    setMaxRequests,
  };
}
