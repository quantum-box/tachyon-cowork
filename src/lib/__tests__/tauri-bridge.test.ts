import { afterEach, describe, expect, it, vi } from "vitest";
import { getTauriPlatform, isTauri, isTauriMobile } from "../tauri-bridge";

type TestTauriGlobal = typeof globalThis & {
  isTauri?: boolean;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

function tauriGlobal(): TestTauriGlobal {
  return globalThis as TestTauriGlobal;
}

describe("tauri bridge environment detection", () => {
  afterEach(() => {
    delete tauriGlobal().isTauri;
    delete tauriGlobal().__TAURI__;
    delete tauriGlobal().__TAURI_INTERNALS__;
    vi.unstubAllEnvs();
  });

  it("detects Tauri v2 runtime without requiring the global Tauri API", () => {
    tauriGlobal().isTauri = true;

    expect(isTauri()).toBe(true);
  });

  it("detects Tauri internals used by the invoke bridge", () => {
    tauriGlobal().__TAURI_INTERNALS__ = {};

    expect(isTauri()).toBe(true);
  });

  it("keeps the legacy global Tauri API detection", () => {
    tauriGlobal().__TAURI__ = {};

    expect(isTauri()).toBe(true);
  });

  it("treats the iOS Tauri runtime as mobile", () => {
    tauriGlobal().isTauri = true;
    vi.stubEnv("TAURI_ENV_PLATFORM", "ios");

    expect(getTauriPlatform()).toBe("ios");
    expect(isTauriMobile()).toBe(true);
  });
});
