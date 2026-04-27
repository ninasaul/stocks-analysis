"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LlmProviderOption =
  | "default"
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "aliyun"
  | "zhipu"
  | "moonshot"
  | "xai"
  | "openrouter"
  | "custom";

export type LlmRuntimeOptionsState = {
  enabled: boolean;
  provider: LlmProviderOption;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  seed: number;
};

type LlmRuntimeOptionsActions = {
  setEnabled: (enabled: boolean) => void;
  setProvider: (provider: LlmProviderOption) => void;
  setBaseUrl: (baseUrl: string) => void;
  setApiKey: (apiKey: string) => void;
  setModel: (model: string) => void;
  setTemperature: (temperature: number) => void;
  setTopP: (topP: number) => void;
  setMaxTokens: (maxTokens: number) => void;
  setSeed: (seed: number) => void;
  resetToDefaults: () => void;
};

const DEFAULT_LLM_RUNTIME_OPTIONS: LlmRuntimeOptionsState = {
  enabled: false,
  provider: "default",
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: 0.1,
  topP: 1,
  maxTokens: 2048,
  seed: 42,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(partial: Partial<LlmRuntimeOptionsState>): LlmRuntimeOptionsState {
  const provider = (
    [
      "default",
      "openai",
      "anthropic",
      "google",
      "deepseek",
      "aliyun",
      "zhipu",
      "moonshot",
      "xai",
      "openrouter",
      "custom",
    ] as const
  ).includes(partial.provider as LlmProviderOption)
    ? (partial.provider as LlmProviderOption)
    : DEFAULT_LLM_RUNTIME_OPTIONS.provider;
  const baseUrl = String(partial.baseUrl ?? "").trim();
  const apiKey = String(partial.apiKey ?? "").trim();
  const model = String(partial.model ?? "").trim();
  return {
    enabled: Boolean(partial.enabled),
    provider,
    baseUrl,
    apiKey,
    model,
    temperature: clamp(Number(partial.temperature ?? DEFAULT_LLM_RUNTIME_OPTIONS.temperature), 0, 2),
    topP: clamp(Number(partial.topP ?? DEFAULT_LLM_RUNTIME_OPTIONS.topP), 0, 1),
    maxTokens: Math.floor(clamp(Number(partial.maxTokens ?? DEFAULT_LLM_RUNTIME_OPTIONS.maxTokens), 1, 32768)),
    seed: Math.floor(clamp(Number(partial.seed ?? DEFAULT_LLM_RUNTIME_OPTIONS.seed), 0, 2147483647)),
  };
}

export const useLlmRuntimeOptionsStore = create<LlmRuntimeOptionsState & LlmRuntimeOptionsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_LLM_RUNTIME_OPTIONS,
      setEnabled: (enabled) => set({ enabled }),
      setProvider: (provider) => set({ provider }),
      setBaseUrl: (baseUrl) => set({ baseUrl: baseUrl.trim() }),
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setModel: (model) => set({ model: model.trim() }),
      setTemperature: (temperature) => set({ temperature: clamp(temperature, 0, 2) }),
      setTopP: (topP) => set({ topP: clamp(topP, 0, 1) }),
      setMaxTokens: (maxTokens) => set({ maxTokens: Math.floor(clamp(maxTokens, 1, 32768)) }),
      setSeed: (seed) => set({ seed: Math.floor(clamp(seed, 0, 2147483647)) }),
      resetToDefaults: () => set({ ...DEFAULT_LLM_RUNTIME_OPTIONS }),
    }),
    {
      name: "zhputian-llm-runtime-options",
      version: 1,
      partialize: (s) => ({
        enabled: s.enabled,
        provider: s.provider,
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        temperature: s.temperature,
        topP: s.topP,
        maxTokens: s.maxTokens,
        seed: s.seed,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalize(persisted as Partial<LlmRuntimeOptionsState> & Record<string, unknown>),
      }),
    },
  ),
);
