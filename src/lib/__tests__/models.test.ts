import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_OPTIONS,
  resolveModelOptions,
} from "../models";
import type { ModelInfo } from "../types";

function buildModel(id: string, name: string, provider = "test"): ModelInfo {
  return {
    id,
    name,
    provider,
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
      buildModel(
        "anthropic/claude-sonnet-4.6",
        "Claude Sonnet 4.6",
        "anthropic",
      ),
      buildModel("anthropic/claude-opus-4.6", "Claude Opus 4.6", "anthropic"),
      buildModel("anthropic/claude-haiku-4.5", "Claude Haiku 4.5", "anthropic"),
      buildModel(
        "bedrock/claude-4-5-sonnet",
        "Claude Sonnet 4.5 (Bedrock)",
        "bedrock",
      ),
      buildModel("openai/gpt-5-4", "GPT-5.4", "openai"),
      buildModel("google/gemini-3.1-pro-latest", "Gemini 3.1 Pro", "google"),
      buildModel(
        "google/gemini-3.1-flash-latest",
        "Gemini 3.1 Flash",
        "google",
      ),
    ];

    expect(resolveModelOptions(availableModels)).toEqual([
      {
        id: "anthropic/claude-sonnet-4.6",
        label: "Claude Sonnet 4.6 (Anthropic API)",
      },
      {
        id: "anthropic/claude-opus-4.6",
        label: "Claude Opus 4.6 (Anthropic API)",
      },
      {
        id: "anthropic/claude-haiku-4.5",
        label: "Claude Haiku 4.5 (Anthropic API)",
      },
      {
        id: "bedrock/claude-4-5-sonnet",
        label: "Claude Sonnet 4.5 (Bedrock)",
      },
      { id: "openai/gpt-5-4", label: "GPT-5.4" },
      { id: "google/gemini-3.1-pro-latest", label: "Gemini 3.1 Pro" },
      { id: "google/gemini-3.1-flash-latest", label: "Gemini 3.1 Flash" },
    ]);
  });

  it("falls back per model when the API only returns a subset", () => {
    const availableModels = [
      buildModel(
        "anthropic/claude-sonnet-4.6",
        "Claude Sonnet 4.6",
        "anthropic",
      ),
      buildModel("openai/gpt-5-4", "GPT-5.4", "openai"),
    ];

    expect(resolveModelOptions(availableModels)).toEqual([
      {
        id: "anthropic/claude-sonnet-4.6",
        label: "Claude Sonnet 4.6 (Anthropic API)",
      },
      {
        id: "anthropic/claude-opus-4-6",
        label: "Claude Opus 4.6 (Anthropic API)",
      },
      {
        id: "anthropic/claude-haiku-4-5",
        label: "Claude Haiku 4.5 (Anthropic API)",
      },
      {
        id: "bedrock/claude-4-5-sonnet",
        label: "Claude Sonnet 4.5 (Bedrock)",
      },
      { id: "openai/gpt-5-4", label: "GPT-5.4" },
      { id: "google/gemini-3.1-pro", label: "Gemini 3.1 Pro" },
      { id: "google/gemini-3.1-flash", label: "Gemini 3.1 Flash" },
    ]);
  });

  it("exposes Bedrock Sonnet 4.5 in the fallback list", () => {
    expect(resolveModelOptions()).toContainEqual({
      id: "bedrock/claude-4-5-sonnet",
      label: "Claude Sonnet 4.5 (Bedrock)",
    });
  });

  it("does not use Bedrock models as Anthropic API matches", () => {
    const availableModels = [
      buildModel(
        "bedrock/claude-sonnet-4-6",
        "Claude Sonnet 4.6 (Bedrock)",
        "bedrock",
      ),
      buildModel(
        "bedrock/claude-4-5-sonnet",
        "Claude Sonnet 4.5 (Bedrock)",
        "bedrock",
      ),
    ];

    const resolvedModels = resolveModelOptions(availableModels);

    expect(resolvedModels[0]).toEqual({
      id: "anthropic/claude-sonnet-4-6",
      label: "Claude Sonnet 4.6 (Anthropic API)",
    });
    expect(resolvedModels).toContainEqual({
      id: "bedrock/claude-4-5-sonnet",
      label: "Claude Sonnet 4.5 (Bedrock)",
    });
  });
});
