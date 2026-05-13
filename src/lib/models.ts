import type { ModelInfo } from "./types";

export type ModelOption = {
  id: string;
  label: string;
};

type ProviderKey = "anthropic" | "bedrock" | "openai" | "google";

type PreferredModel = ModelOption & {
  provider: ProviderKey;
  aliases: string[];
};

const PREFERRED_MODELS: PreferredModel[] = [
  {
    id: "anthropic/claude-sonnet-4-6",
    label: "Claude Sonnet 4.6 (Anthropic API)",
    provider: "anthropic",
    aliases: ["claude sonnet 4.6", "anthropic claude sonnet 4.6"],
  },
  {
    id: "anthropic/claude-opus-4-6",
    label: "Claude Opus 4.6 (Anthropic API)",
    provider: "anthropic",
    aliases: ["claude opus 4.6", "anthropic claude opus 4.6"],
  },
  {
    id: "anthropic/claude-haiku-4-5",
    label: "Claude Haiku 4.5 (Anthropic API)",
    provider: "anthropic",
    aliases: ["claude haiku 4.5", "anthropic claude haiku 4.5"],
  },
  {
    id: "bedrock/claude-4-5-sonnet",
    label: "Claude Sonnet 4.5 (Bedrock)",
    provider: "bedrock",
    aliases: [
      "claude 4.5 sonnet bedrock",
      "claude sonnet 4.5 bedrock",
      "anthropic claude 4.5 sonnet bedrock",
      "bedrock claude 4.5 sonnet",
    ],
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    provider: "openai",
    aliases: ["gpt 5.4", "openai gpt 5.4"],
  },
  {
    id: "google/gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
    provider: "google",
    aliases: ["gemini 3.1 pro", "google gemini 3.1 pro"],
  },
  {
    id: "google/gemini-3.1-flash",
    label: "Gemini 3.1 Flash",
    provider: "google",
    aliases: ["gemini 3.1 flash", "google gemini 3.1 flash"],
  },
];

export const DEFAULT_MODEL_ID = PREFERRED_MODELS[0].id;

export const FALLBACK_MODEL_OPTIONS: ModelOption[] = PREFERRED_MODELS.map(
  ({ id, label }) => ({ id, label }),
);

function normalizeModelKey(value?: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isBedrockModel(model: ModelInfo): boolean {
  const id = model.id.toLowerCase();
  const provider = normalizeModelKey(model.provider);
  const name = normalizeModelKey(model.name);
  return (
    id.startsWith("bedrock/") ||
    provider.includes("bedrock") ||
    name.includes("bedrock")
  );
}

function matchesPreferredProvider(
  preferredModel: PreferredModel,
  model: ModelInfo,
): boolean {
  const id = model.id.toLowerCase();
  const provider = normalizeModelKey(model.provider);

  switch (preferredModel.provider) {
    case "anthropic":
      return (
        !isBedrockModel(model) &&
        (id.startsWith("anthropic/") || provider.includes("anthropic"))
      );
    case "bedrock":
      return isBedrockModel(model);
    case "openai":
      return id.startsWith("openai/") || provider.includes("openai");
    case "google":
      return (
        id.startsWith("google/") ||
        id.startsWith("google_ai/") ||
        provider.includes("google")
      );
  }
}

function findMatchingModel(
  preferredModel: PreferredModel,
  availableModels?: ModelInfo[] | null,
): ModelInfo | undefined {
  if (!availableModels?.length) return undefined;

  return availableModels.find((model) => {
    if (!matchesPreferredProvider(preferredModel, model)) return false;

    const haystacks = [model.id, model.name].map(normalizeModelKey);
    return preferredModel.aliases.some((alias) => {
      const needle = normalizeModelKey(alias);
      return haystacks.some((haystack) => haystack.includes(needle));
    });
  });
}

function toModelOption(model: ModelInfo): ModelOption {
  return {
    id: model.id,
    label: model.name || model.id,
  };
}

export function resolveModelOptions(
  availableModels?: ModelInfo[] | null,
): ModelOption[] {
  if (!availableModels) {
    return FALLBACK_MODEL_OPTIONS;
  }

  const selectedIds = new Set<string>();
  const preferredOptions = PREFERRED_MODELS.flatMap((preferredModel) => {
    const matchedModel = findMatchingModel(preferredModel, availableModels);
    if (!matchedModel) return [];
    selectedIds.add(matchedModel.id);
    return {
      id: matchedModel.id,
      label: preferredModel.label,
    };
  });

  const remainingOptions = availableModels
    .filter((model) => !selectedIds.has(model.id))
    .map(toModelOption);

  return [...preferredOptions, ...remainingOptions];
}

export function hasModelOption(
  modelOptions: ModelOption[],
  modelId: string,
): boolean {
  return modelOptions.some((modelOption) => modelOption.id === modelId);
}
