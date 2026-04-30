import { getPublicApiBaseUrl } from "@/lib/env";

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

export type LlmSettingsPayload = {
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

export type LlmSettingsWithConfigId = LlmSettingsPayload & {
  configId?: number;
  configName?: string;
};

export type UserLlmConfigItem = {
  id: number;
  name: string;
  isActive: boolean;
  provider: LlmProviderOption;
};

export type LlmPresetItem = {
  id: number;
  name: string;
  provider: LlmProviderOption;
  model: string;
  isActive: boolean;
};

export type LlmConfigTestResult = {
  success: boolean;
  message: string;
  response?: string | null;
  usage?: Record<string, unknown> | null;
};

type ApiErrorPayload = {
  message?: string;
  error?: string;
  detail?: string | Array<string | { msg?: string; type?: string }>;
};

type CandidateRequest = {
  path: string;
  init: RequestInit;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type UserConfigPayload = {
  id: number;
  name: string;
  provider?: LlmProviderOption;
  api_key?: string;
  base_url?: string;
  model?: string;
  is_active?: boolean;
  config?: {
    enabled?: boolean;
    temperature?: number;
    topP?: number;
    top_p?: number;
    maxTokens?: number;
    max_tokens?: number;
    seed?: number;
  };
};

type PreferencePayload = {
  has_preference?: boolean;
  preference?: {
    user_config_id?: number;
    preset_id?: number;
  };
};

function joinUrl(path: string): string {
  const base = getPublicApiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

function canFallback(status: number): boolean {
  return [404, 405, 415, 422].includes(status);
}

async function parseApiError(response: Response | null): Promise<string> {
  if (!response) return "请求失败（未收到服务响应）";
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    const { detail, message, error } = payload;
    if (typeof message === "string" && message.trim()) return message;
    if (typeof error === "string" && error.trim()) return error;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const parts = detail.map((item) => (typeof item === "string" ? item : item?.msg ?? JSON.stringify(item)));
      return parts.filter(Boolean).join("；");
    }
  } catch {
    // Ignore and fallback to status code.
  }
  return `请求失败（${response.status}）`;
}

async function requestWithCandidates<T>(
  candidates: CandidateRequest[],
  authenticatedFetch: FetchLike,
): Promise<T> {
  let response: Response | null = null;
  for (const candidate of candidates) {
    response = await authenticatedFetch(joinUrl(candidate.path), candidate.init);
    if (response.ok) {
      return (await response.json()) as T;
    }
    if (!canFallback(response.status)) break;
  }
  throw new Error(await parseApiError(response));
}

export async function requestLlmSettings(authenticatedFetch: FetchLike): Promise<LlmSettingsPayload> {
  const preference = await requestUserLlmPreference(authenticatedFetch);
  let config: UserConfigPayload | undefined;

  if (preference.configId) {
    try {
      config = await requestLlmConfigById(preference.configId, authenticatedFetch);
    } catch {
      config = undefined;
    }
  } else {
    const list = await requestUserLlmConfigs(authenticatedFetch);
    if (list.length > 0) {
      config = await requestLlmConfigById(list[0].id, authenticatedFetch);
    }
  }

  if (!config) {
    const list = await requestUserLlmConfigs(authenticatedFetch);
    if (list.length > 0) {
      config = await requestLlmConfigById(list[0].id, authenticatedFetch);
    }
  }

  if (!config) {
    return {
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
  }
  return {
    enabled: Boolean(config.is_active ?? config.config?.enabled ?? true),
    provider: config.provider ?? "custom",
    baseUrl: String(config.base_url ?? ""),
    apiKey: String(config.api_key ?? ""),
    model: String(config.model ?? ""),
    temperature: Number(config.config?.temperature ?? 0.1),
    topP: Number(config.config?.topP ?? config.config?.top_p ?? 1),
    maxTokens: Number(config.config?.maxTokens ?? config.config?.max_tokens ?? 2048),
    seed: Number(config.config?.seed ?? 42),
    configId: config.id,
    configName: config.name,
  } as LlmSettingsWithConfigId;
}

export async function requestSaveLlmSettings(
  payload: LlmSettingsPayload,
  authenticatedFetch: FetchLike,
  configId?: number,
  configName?: string,
): Promise<LlmSettingsWithConfigId> {
  const requestPayload = {
    name: configName ?? "",
    provider: payload.provider,
    api_key: payload.apiKey,
    base_url: payload.baseUrl,
    model: payload.model,
    is_active: payload.enabled,
    config: {
      temperature: payload.temperature,
      top_p: payload.topP,
      max_tokens: payload.maxTokens,
      seed: payload.seed,
    },
  };
  const path = configId ? `/api/llm/user/configs/${configId}` : "/api/llm/user/configs";
  const method = configId ? "PUT" : "POST";
  const saveResponse = await authenticatedFetch(joinUrl(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
  if (!saveResponse.ok) {
    throw new Error(await parseApiError(saveResponse));
  }
  const savePayload = (await saveResponse.json()) as { config?: UserConfigPayload };
  const savedConfig = savePayload.config;
  const savedConfigId = savedConfig?.id;
  if (!savedConfigId) {
    throw new Error("保存成功但未返回配置ID");
  }

  return {
    enabled: Boolean(savedConfig.is_active ?? savedConfig.config?.enabled ?? payload.enabled),
    provider: (savedConfig.provider as LlmProviderOption | undefined) ?? payload.provider,
    baseUrl: String(savedConfig.base_url ?? payload.baseUrl),
    apiKey: payload.apiKey,
    model: String(savedConfig.model ?? payload.model),
    temperature: Number(savedConfig.config?.temperature ?? payload.temperature),
    topP: Number(savedConfig.config?.topP ?? savedConfig.config?.top_p ?? payload.topP),
    maxTokens: Number(savedConfig.config?.maxTokens ?? savedConfig.config?.max_tokens ?? payload.maxTokens),
    seed: Number(savedConfig.config?.seed ?? payload.seed),
    configId: savedConfigId,
    configName: savedConfig.name,
  };
}

export async function requestLlmConfigById(configId: number, authenticatedFetch: FetchLike): Promise<UserConfigPayload | undefined> {
  const response = await authenticatedFetch(joinUrl(`/api/llm/user/configs/${configId}`), { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  const payload = (await response.json()) as { config?: UserConfigPayload };
  return payload.config;
}

export async function requestUserLlmConfig(configId: number, authenticatedFetch: FetchLike): Promise<LlmSettingsWithConfigId> {
  const config = await requestLlmConfigById(configId, authenticatedFetch);
  if (!config) {
    throw new Error("配置不存在");
  }

  return {
    enabled: Boolean(config.is_active ?? config.config?.enabled ?? true),
    provider: config.provider ?? "custom",
    baseUrl: String(config.base_url ?? ""),
    apiKey: String(config.api_key ?? ""),
    model: String(config.model ?? ""),
    temperature: Number(config.config?.temperature ?? 0.1),
    topP: Number(config.config?.topP ?? config.config?.top_p ?? 1),
    maxTokens: Number(config.config?.maxTokens ?? config.config?.max_tokens ?? 2048),
    seed: Number(config.config?.seed ?? 42),
    configId: config.id,
    configName: config.name,
  };
}

export async function requestUserLlmConfigs(
  authenticatedFetch: FetchLike,
): Promise<UserLlmConfigItem[]> {
  const response = await authenticatedFetch(joinUrl("/api/llm/user/configs"), { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  const payload = (await response.json()) as { configs?: UserConfigPayload[] };
  return (payload.configs ?? []).map((item) => ({
    id: item.id,
    name: String(item.name ?? `配置-${item.id}`),
    isActive: Boolean(item.is_active ?? false),
    provider: item.provider ?? "custom",
  }));
}

export async function requestUserLlmPreference(
  authenticatedFetch: FetchLike,
): Promise<{ configId?: number; presetId?: number }> {
  const response = await authenticatedFetch(joinUrl("/api/llm/user/preference"), { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  const payload = (await response.json()) as PreferencePayload;
  return {
    configId: payload.preference?.user_config_id,
    presetId: payload.preference?.preset_id,
  };
}

export async function requestSetUserLlmPreference(configId: number, authenticatedFetch: FetchLike): Promise<void> {
  const body = JSON.stringify({ user_config_id: configId });
  const candidates: CandidateRequest[] = [
    {
      path: "/api/llm/user/preference",
      init: { method: "PUT", headers: { "Content-Type": "application/json" }, body },
    },
    {
      path: "/api/llm/user/preference",
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body },
    },
  ];
  let response: Response | null = null;
  for (const candidate of candidates) {
    response = await authenticatedFetch(joinUrl(candidate.path), candidate.init);
    if (response.ok) return;
    if (!canFallback(response.status)) break;
  }
  if (response) {
    throw new Error(await parseApiError(response));
  }
}

export async function requestLlmPresets(authenticatedFetch: FetchLike): Promise<LlmPresetItem[]> {
  const payload = await requestWithCandidates<
    | { presets?: UserConfigPayload[]; items?: UserConfigPayload[]; data?: UserConfigPayload[] }
    | UserConfigPayload[]
  >(
    [
      { path: "/api/llm/presets", init: { method: "GET" } },
      { path: "/llm/presets", init: { method: "GET" } },
    ],
    authenticatedFetch,
  );

  const source = Array.isArray(payload) ? payload : payload.presets ?? payload.items ?? payload.data ?? [];

  return source.map((item, index) => ({
    id: Number(item.id ?? index + 1),
    name: String(item.name ?? `系统预设-${item.id ?? index + 1}`),
    provider: item.provider ?? "default",
    // 系统预设列表以 name 作为大模型名称来源
    model: String(item.name ?? item.model ?? ""),
    isActive: Boolean(item.is_active ?? false),
  }));
}

export async function requestSetLlmPresetPreference(presetId: number, authenticatedFetch: FetchLike): Promise<void> {
  const bodyCandidates = [
    { preset_id: presetId },
    { llm_preset_id: presetId },
    { presetId },
  ];

  let lastResponse: Response | null = null;
  for (const bodyValue of bodyCandidates) {
    const candidates: CandidateRequest[] = [
      {
        path: "/api/llm/user/preference",
        init: { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyValue) },
      },
      {
        path: "/api/llm/user/preference",
        init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyValue) },
      },
    ];
    for (const candidate of candidates) {
      const response = await authenticatedFetch(joinUrl(candidate.path), candidate.init);
      if (response.ok) return;
      lastResponse = response;
      if (!canFallback(response.status)) break;
    }
  }
  throw new Error(await parseApiError(lastResponse));
}

export async function requestDeleteUserLlmPreference(authenticatedFetch: FetchLike): Promise<void> {
  const response = await authenticatedFetch(joinUrl("/api/llm/user/preference"), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function requestLlmModels(
  payload: Pick<LlmSettingsPayload, "provider" | "baseUrl" | "apiKey">,
  authenticatedFetch: FetchLike,
): Promise<string[]> {
  const requestBody = JSON.stringify({
    provider: payload.provider,
    base_url: payload.baseUrl,
    api_key: payload.apiKey,
  });
  const query = new URLSearchParams({
    provider: payload.provider,
    base_url: payload.baseUrl,
  }).toString();
  const candidates: CandidateRequest[] = [
    {
      path: "/api/llm/models",
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
    },
    { path: `/api/llm/models?${query}`, init: { method: "GET" } },
    {
      path: "/llm/models",
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
    },
  ];
  const payloadResult = await requestWithCandidates<
    | string[]
    | {
        data?: Array<{ id?: string; name?: string } | string>;
        models?: Array<{ id?: string; name?: string } | string>;
        items?: Array<{ id?: string; name?: string } | string>;
      }
  >(candidates, authenticatedFetch);

  const collect = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    return input
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const obj = item as { id?: string; name?: string };
          return String(obj.id ?? obj.name ?? "").trim();
        }
        return "";
      })
      .filter(Boolean);
  };

  if (Array.isArray(payloadResult)) {
    return collect(payloadResult);
  }

  return [...new Set([...collect(payloadResult.data), ...collect(payloadResult.models), ...collect(payloadResult.items)])];
}

export async function requestTestLlmConfig(configId: number, authenticatedFetch: FetchLike): Promise<LlmConfigTestResult> {
  const response = await authenticatedFetch(joinUrl(`/api/llm/user/configs/${configId}/test`), {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return (await response.json()) as LlmConfigTestResult;
}

export async function requestDeleteLlmConfig(configId: number, authenticatedFetch: FetchLike): Promise<void> {
  const response = await authenticatedFetch(joinUrl(`/api/llm/user/configs/${configId}`), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function requestUpdateLlmEnabledOnly(
  configId: number,
  enabled: boolean,
  authenticatedFetch: FetchLike,
): Promise<LlmSettingsWithConfigId> {
  const putResponse = await authenticatedFetch(joinUrl(`/api/llm/user/configs/${configId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      is_active: enabled,
    }),
  });
  if (!putResponse.ok) {
    throw new Error(await parseApiError(putResponse));
  }
  const putPayload = (await putResponse.json()) as { config?: UserConfigPayload };
  const saved = putPayload.config;
  if (!saved) {
    throw new Error("开关状态更新成功但返回配置为空");
  }

  return {
    enabled: Boolean(saved.is_active ?? saved.config?.enabled ?? enabled),
    provider: saved.provider ?? "custom",
    baseUrl: String(saved.base_url ?? ""),
    apiKey: String(saved.api_key ?? ""),
    model: String(saved.model ?? ""),
    temperature: Number(saved.config?.temperature ?? 0.1),
    topP: Number(saved.config?.topP ?? saved.config?.top_p ?? 1),
    maxTokens: Number(saved.config?.maxTokens ?? saved.config?.max_tokens ?? 2048),
    seed: Number(saved.config?.seed ?? 42),
    configId: saved.id,
  };
}
