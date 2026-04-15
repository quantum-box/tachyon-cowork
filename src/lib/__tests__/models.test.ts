import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_OPTIONS,
  resolveModelOptions,
} from "../models";
import type { ModelInfo } from "../types";

function buildModel(id: string, name: string): ModelInfo {
  return {
    id,
    name,
    provider: "test",
    supported_features: ["agent"],
  };
}

describe("resolveModelOptions", () => {
  it("returns the curated fallback list when API models are unavailable", () => {
    expect(resolveModelOptions()).toEqual(FALLBACK_MODEL_OPTIONS);
    expect(FALLBACK_MODEL_OPTIONS[0]?.id).toBe(DEFAULT_MODEL_ID);
  });

  it("uses API model ids when preferred models are returned", () => {
    const availableModels = [
      buildModel("anthropic/claude-sonnet-4.6", "Claude Sonnet 4.6"),
      buildModel("anthropic/claude-opus-4.6", "Claude Opus 4.6"),
      buildModel("anthropic/claude-haiku-4.5", "Claude Haiku 4.5"),
      buildModel("openai/gpt-5-4", "GPT-5.4"),
      buildModel("google/gemini-3.1-pro-latest", "Gemini 3.1 Pro"),
      buildModel("google/gemini-3.1-flash-latest", "Gemini 3.1 Flash"),
    ];

    expect(resolveModelOptions(availableModels)).toEqual([
      { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
      { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6" },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
      { id: "openai/gpt-5-4", label: "GPT-5.4" },
      { id: "google/gemini-3.1-pro-latest", label: "Gemini 3.1 Pro" },
      { id: "google/gemini-3.1-flash-latest", label: "Gemini 3.1 Flash" },
    ]);
  });

  it("falls back per model when the API only returns a subset", () => {
    const availableModels = [
      buildModel("anthropic/claude-sonnet-4.6", "Claude Sonnet 4.6"),
      buildModel("openai/gpt-5-4", "GPT-5.4"),
    ];

    expect(resolveModelOptions(availableModels)).toEqual([
      { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
      { id: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
      { id: "openai/gpt-5-4", label: "GPT-5.4" },
      { id: "google/gemini-3.1-pro", label: "Gemini 3.1 Pro" },
      { id: "google/gemini-3.1-flash", label: "Gemini 3.1 Flash" },
    ]);
  });
});
