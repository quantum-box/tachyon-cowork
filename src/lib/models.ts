import type { ModelInfo } from "./types";

export type ModelOption = {
  id: string;
  label: string;
};

type PreferredModel = ModelOption & {
  aliases: string[];
};

const PREFERRED_MODELS: PreferredModel[] = [
  {
    id: "anthropic/claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    aliases: ["claude sonnet 4.6", "anthropic claude sonnet 4.6"],
  },
  {
    id: "anthropic/claude-opus-4-6",
    label: "Claude Opus 4.6",
    aliases: ["claude opus 4.6", "anthropic claude opus 4.6"],
  },
  {
    id: "anthropic/claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    aliases: ["claude haiku 4.5", "anthropic claude haiku 4.5"],
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    aliases: ["gpt 5.4", "openai gpt 5.4"],
  },
  {
    id: "google/gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
    aliases: ["gemini 3.1 pro", "google gemini 3.1 pro"],
  },
  {
    id: "google/gemini-3.1-flash",
    label: "Gemini 3.1 Flash",
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

function findMatchingModel(
  preferredModel: PreferredModel,
  availableModels?: ModelInfo[] | null,
): ModelInfo | undefined {
  if (!availableModels?.length) return undefined;

  return availableModels.find((model) => {
    const haystacks = [model.id, model.name].map(normalizeModelKey);
    return preferredModel.aliases.some((alias) => {
      const needle = normalizeModelKey(alias);
      return haystacks.some((haystack) => haystack.includes(needle));
    });
  });
}

export function resolveModelOptions(
  availableModels?: ModelInfo[] | null,
): ModelOption[] {
  return PREFERRED_MODELS.map((preferredModel) => {
    const matchedModel = findMatchingModel(preferredModel, availableModels);
    return {
      id: matchedModel?.id ?? preferredModel.id,
      label: preferredModel.label,
    };
  });
}

export function hasModelOption(
  modelOptions: ModelOption[],
  modelId: string,
): boolean {
  return modelOptions.some((modelOption) => modelOption.id === modelId);
}
