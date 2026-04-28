"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import {
  CircleHelpIcon,
  CircleAlertIcon,
  ChevronDownIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  GaugeIcon,
  RefreshCwIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useLlmRuntimeOptionsStore } from "@/stores/use-llm-runtime-options-store";
import type { LlmProviderOption, LlmRuntimeOptionsState } from "@/stores/use-llm-runtime-options-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import {
  requestDeleteLlmConfig,
  requestLlmSettings,
  requestSaveLlmSettings,
  requestTestLlmConfig,
  requestUpdateLlmEnabledOnly,
} from "@/lib/api/llm";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const PROVIDER_OPTIONS: { value: LlmProviderOption; label: string }[] = [
  { value: "default", label: "跟随服务端默认" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "aliyun", label: "阿里云 Qwen" },
  { value: "zhipu", label: "智谱 AI" },
  { value: "moonshot", label: "Moonshot (Kimi)" },
  { value: "xai", label: "xAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "custom", label: "自定义兼容网关" },
];

const PROVIDER_LOGO_NAME: Partial<Record<LlmProviderOption, string>> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  google: "Gemini",
  deepseek: "DeepSeek",
  aliyun: "Qwen",
  zhipu: "bigmodel",
  moonshot: "Kimi",
  xai: "Grok",
};

const MODEL_PRESETS: Record<LlmProviderOption, string[]> = {
  default: ["gpt-4.1", "gpt-4o", "claude-sonnet-4-5", "gemini-2.5-pro"],
  openai: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "o4-mini"],
  anthropic: ["claude-opus-4-1", "claude-sonnet-4-5", "claude-3-5-haiku"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  aliyun: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long"],
  zhipu: ["glm-4-plus", "glm-4-air", "glm-4-flash", "glm-4v-plus"],
  moonshot: ["kimi-k2", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  xai: ["grok-3", "grok-3-mini", "grok-2-1212"],
  openrouter: ["openai/gpt-4.1", "anthropic/claude-sonnet-4-5", "google/gemini-2.5-pro"],
  custom: ["custom-model-v1", "custom-model-v2"],
};

const PROVIDER_ENDPOINT_HINTS: Partial<Record<LlmProviderOption, { url: string; note?: string }>> = {
  openai: { url: "https://api.openai.com/v1" },
  anthropic: { url: "https://api.anthropic.com/v1/messages", note: "如走兼容网关可填网关地址。" },
  google: { url: "https://generativelanguage.googleapis.com/v1beta/openai/" },
  deepseek: { url: "https://api.deepseek.com/v1" },
  aliyun: { url: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  zhipu: { url: "https://open.bigmodel.cn/api/paas/v4/" },
  moonshot: { url: "https://api.moonshot.cn/v1" },
  xai: { url: "https://api.x.ai/v1" },
  openrouter: { url: "https://openrouter.ai/api/v1" },
};

function sanitizeBaseUrlInput(input: string): string {
  let value = input
    .replace(/\u3000/g, " ")
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/\s+/g, "");
  if (!value) return "";

  if (!/^https?:\/\//i.test(value) && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(value)) {
    value = `https://${value}`;
  }

  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    let pathname = parsed.pathname.replace(/\/+$/, "");
    pathname = pathname
      .replace(/\/models$/i, "")
      .replace(/\/chat\/completions$/i, "")
      .replace(/\/v1beta\/openai\/chat\/completions$/i, "/v1beta/openai");
    parsed.pathname = pathname || "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function normalizeImportedSettings(input: unknown): LlmRuntimeOptionsState {
  const raw = (input ?? {}) as Partial<LlmRuntimeOptionsState> & Record<string, unknown>;
  const provider: LlmProviderOption =
    raw.provider === "default" ||
    raw.provider === "openai" ||
    raw.provider === "anthropic" ||
    raw.provider === "google" ||
    raw.provider === "deepseek" ||
    raw.provider === "aliyun" ||
    raw.provider === "zhipu" ||
    raw.provider === "moonshot" ||
    raw.provider === "xai" ||
    raw.provider === "openrouter" ||
    raw.provider === "custom"
      ? raw.provider
      : "default";
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  const temperature = Math.min(2, Math.max(0, Number(raw.temperature ?? 0.1)));
  const topP = Math.min(1, Math.max(0, Number(raw.topP ?? 1)));
  const maxTokens = Math.floor(Math.min(32768, Math.max(1, Number(raw.maxTokens ?? 2048))));
  const seed = Math.floor(Math.min(2147483647, Math.max(0, Number(raw.seed ?? 42))));
  return {
    enabled: Boolean(raw.enabled),
    provider,
    baseUrl,
    apiKey,
    model,
    temperature: Number.isFinite(temperature) ? temperature : 0.1,
    topP: Number.isFinite(topP) ? topP : 1,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : 2048,
    seed: Number.isFinite(seed) ? seed : 42,
  };
}

export default function SettingsLlmPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [validatingBeforeSave, setValidatingBeforeSave] = useState(false);
  const [syncingRemote, setSyncingRemote] = useState(false);
  const [savingRemote, setSavingRemote] = useState(false);
  const [testingRemote, setTestingRemote] = useState(false);
  const [syncingToggleRemote, setSyncingToggleRemote] = useState(false);
  const [remoteSynced, setRemoteSynced] = useState(false);
  const [remoteConfigId, setRemoteConfigId] = useState<number | undefined>(undefined);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [lastSavedSignature, setLastSavedSignature] = useState<string>("");
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogTitle, setErrorDialogTitle] = useState("操作失败");
  const [errorDialogMessage, setErrorDialogMessage] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resettingRemote, setResettingRemote] = useState(false);
  const authHydrated = useStoreHydrated(useAuthStore);
  const session = useAuthStore((s) => s.session);
  const accessToken = useAuthStore((s) => s.accessToken);
  const syncSession = useAuthStore((s) => s.syncSession);
  const authenticatedFetch = useAuthStore((s) => s.authenticatedFetch);
  const enabled = useLlmRuntimeOptionsStore((s) => s.enabled);
  const provider = useLlmRuntimeOptionsStore((s) => s.provider);
  const baseUrl = useLlmRuntimeOptionsStore((s) => s.baseUrl);
  const apiKey = useLlmRuntimeOptionsStore((s) => s.apiKey);
  const model = useLlmRuntimeOptionsStore((s) => s.model);
  const temperature = useLlmRuntimeOptionsStore((s) => s.temperature);
  const topP = useLlmRuntimeOptionsStore((s) => s.topP);
  const maxTokens = useLlmRuntimeOptionsStore((s) => s.maxTokens);
  const seed = useLlmRuntimeOptionsStore((s) => s.seed);
  const setEnabled = useLlmRuntimeOptionsStore((s) => s.setEnabled);
  const setProvider = useLlmRuntimeOptionsStore((s) => s.setProvider);
  const setBaseUrl = useLlmRuntimeOptionsStore((s) => s.setBaseUrl);
  const setApiKey = useLlmRuntimeOptionsStore((s) => s.setApiKey);
  const setModel = useLlmRuntimeOptionsStore((s) => s.setModel);
  const setTemperature = useLlmRuntimeOptionsStore((s) => s.setTemperature);
  const setTopP = useLlmRuntimeOptionsStore((s) => s.setTopP);
  const setMaxTokens = useLlmRuntimeOptionsStore((s) => s.setMaxTokens);
  const setSeed = useLlmRuntimeOptionsStore((s) => s.setSeed);
  const resetToDefaults = useLlmRuntimeOptionsStore((s) => s.resetToDefaults);
  const presetModels = MODEL_PRESETS[provider] ?? [];
  const mergedModelOptions = [...new Set([...fetchedModels, ...presetModels])];
  const selectedPresetValue = mergedModelOptions.includes(model) ? model : "__custom";
  const endpointHint = PROVIDER_ENDPOINT_HINTS[provider];
  const { resolvedTheme } = useTheme();
  const logoTheme = resolvedTheme === "dark" ? "dark" : "light";
  const selectedProviderLogo = PROVIDER_LOGO_NAME[provider];
  const canSyncRemote = authHydrated && session === "user";
  const authIdentity = `${session}:${accessToken ?? ""}`;
  const trimmedBaseUrl = baseUrl.trim();
  const trimmedApiKey = apiKey.trim();
  const trimmedModel = model.trim();
  const requiredConfigHints = useMemo(() => {
    if (!enabled) return [] as string[];
    const missing: string[] = [];
    if (!trimmedBaseUrl) missing.push("请填写请求地址");
    if (!trimmedApiKey) missing.push("请填写 API Key");
    if (!trimmedModel) missing.push("请填写模型名称");
    return missing;
  }, [enabled, trimmedApiKey, trimmedBaseUrl, trimmedModel]);
  const hasRequiredConfig = requiredConfigHints.length === 0;
  const canFetchModels = enabled && Boolean(trimmedBaseUrl) && Boolean(trimmedApiKey);
  const canSaveRemote = canSyncRemote && !savingRemote && (!enabled || hasRequiredConfig);
  const canTestRemote = canSyncRemote && !testingRemote && !!remoteConfigId;
  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        enabled,
        provider,
        baseUrl: trimmedBaseUrl,
        apiKey: trimmedApiKey,
        model: trimmedModel,
        temperature,
        topP,
        maxTokens,
        seed,
      }),
    [enabled, provider, trimmedBaseUrl, trimmedApiKey, trimmedModel, temperature, topP, maxTokens, seed],
  );
  const hasUnsavedChanges = Boolean(lastSavedSignature) && currentSignature !== lastSavedSignature;
  const showError = useCallback((message: string, title = "操作失败") => {
    setErrorDialogTitle(title);
    setErrorDialogMessage(message);
    setErrorDialogOpen(true);
  }, []);
  const handleEnabledChange = useCallback(
    async (nextChecked: boolean) => {
      const nextEnabled = Boolean(nextChecked);
      setEnabled(nextEnabled);

      if (!canSyncRemote || !remoteConfigId) {
        return;
      }

      setSyncingToggleRemote(true);
      try {
        await syncSession();
        const saved = await requestUpdateLlmEnabledOnly(remoteConfigId, nextEnabled, authenticatedFetch);
        setRemoteConfigId(saved.configId);
        setLastSavedSignature(
          JSON.stringify({
            enabled: Boolean(saved.enabled),
            provider: saved.provider,
            baseUrl: String(saved.baseUrl ?? "").trim(),
            apiKey: String(saved.apiKey ?? "").trim(),
            model: String(saved.model ?? "").trim(),
            temperature: Number(saved.temperature ?? 0.1),
            topP: Number(saved.topP ?? 1),
            maxTokens: Number(saved.maxTokens ?? 2048),
            seed: Number(saved.seed ?? 42),
          }),
        );
      } catch (error) {
        setEnabled(!nextEnabled);
        showError(error instanceof Error ? error.message : "开关状态同步失败，请稍后重试。", "同步失败");
      } finally {
        setSyncingToggleRemote(false);
      }
    },
    [
      authenticatedFetch,
      canSyncRemote,
      remoteConfigId,
      setEnabled,
      showError,
      syncSession,
    ],
  );

  const applyImportedSettings = useCallback((snapshot: LlmRuntimeOptionsState) => {
    setEnabled(snapshot.enabled);
    setProvider(snapshot.provider);
    setBaseUrl(snapshot.baseUrl);
    setApiKey(snapshot.apiKey);
    setModel(snapshot.model);
    setTemperature(snapshot.temperature);
    setTopP(snapshot.topP);
    setMaxTokens(snapshot.maxTokens);
    setSeed(snapshot.seed);
  }, [setApiKey, setBaseUrl, setEnabled, setMaxTokens, setModel, setProvider, setSeed, setTemperature, setTopP]);

  const handleExport = () => {
    const payload = {
      enabled,
      provider,
      baseUrl,
      apiKey,
      model,
      temperature,
      topP,
      maxTokens,
      seed,
    } as const;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `llm-runtime-template-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("已导出大模型参数模板。");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const normalized = normalizeImportedSettings(parsed);
      applyImportedSettings(normalized);
      toast.success("已导入参数模板并完成边界修正。");
    } catch {
      showError("导入失败，请检查 JSON 格式后重试。", "导入失败");
    } finally {
      event.target.value = "";
    }
  };

  const handleFetchModels = async () => {
    if (!enabled) {
      showError("请先启用自定义参数。", "无法拉取模型");
      return;
    }
    if (!trimmedBaseUrl) {
      showError("请先填写请求地址。", "无法拉取模型");
      return;
    }
    if (!trimmedApiKey) {
      showError("请先填写 API Key。", "无法拉取模型");
      return;
    }
    setLoadingModels(true);
    try {
      let list: string[] = [];
      const normalizedBase = trimmedBaseUrl.replace(/\/+$/, "");
      const modelUrl = normalizedBase.endsWith("/models") ? normalizedBase : `${normalizedBase}/models`;
      const response = await fetch(modelUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${trimmedApiKey}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        data?: Array<{ id?: string }>;
        models?: Array<{ id?: string; name?: string }>;
        items?: Array<{ id?: string; name?: string }>;
      };
      const fromData = Array.isArray(payload.data)
        ? payload.data.map((x) => String(x?.id ?? "").trim()).filter(Boolean)
        : [];
      const fromModels = Array.isArray(payload.models)
        ? payload.models
            .map((x) => String(x?.id ?? x?.name ?? "").trim())
            .filter(Boolean)
        : [];
      const fromItems = Array.isArray(payload.items)
        ? payload.items
            .map((x) => String(x?.id ?? x?.name ?? "").trim())
            .filter(Boolean)
        : [];
      list = [...new Set([...fromData, ...fromModels, ...fromItems])];
      if (!list.length) {
        throw new Error("empty_models");
      }
      setFetchedModels(list);
      toast.success(`已拉取 ${list.length} 个模型。`);
    } catch {
      showError("模型列表拉取失败，请检查请求地址与 API Key 是否有效。", "拉取失败");
    } finally {
      setLoadingModels(false);
    }
  };

  const fetchModelsDirectly = useCallback(async () => {
    const normalizedBase = trimmedBaseUrl.replace(/\/+$/, "");
    const modelUrl = normalizedBase.endsWith("/models") ? normalizedBase : `${normalizedBase}/models`;
    const response = await fetch(modelUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${trimmedApiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ id?: string; name?: string }>;
      items?: Array<{ id?: string; name?: string }>;
    };
    const fromData = Array.isArray(payload.data)
      ? payload.data.map((x) => String(x?.id ?? "").trim()).filter(Boolean)
      : [];
    const fromModels = Array.isArray(payload.models)
      ? payload.models
          .map((x) => String(x?.id ?? x?.name ?? "").trim())
          .filter(Boolean)
      : [];
    const fromItems = Array.isArray(payload.items)
      ? payload.items
          .map((x) => String(x?.id ?? x?.name ?? "").trim())
          .filter(Boolean)
      : [];
    return [...new Set([...fromData, ...fromModels, ...fromItems])];
  }, [trimmedApiKey, trimmedBaseUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!canSyncRemote || remoteSynced) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      setSyncingRemote(true);
      try {
        await syncSession();
        const remote = await requestLlmSettings(authenticatedFetch);
        if (cancelled) return;
        applyImportedSettings(normalizeImportedSettings(remote));
        setRemoteConfigId((remote as { configId?: number }).configId);
        setLastSavedSignature(
          JSON.stringify({
            enabled: Boolean(remote.enabled),
            provider: remote.provider,
            baseUrl: String(remote.baseUrl ?? "").trim(),
            apiKey: String(remote.apiKey ?? "").trim(),
            model: String(remote.model ?? "").trim(),
            temperature: Number(remote.temperature ?? 0.1),
            topP: Number(remote.topP ?? 1),
            maxTokens: Number(remote.maxTokens ?? 2048),
            seed: Number(remote.seed ?? 42),
          }),
        );
        setRemoteSynced(true);
      } catch {
        if (!cancelled) {
          setRemoteSynced(true);
        }
      } finally {
        if (!cancelled) {
          setSyncingRemote(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyImportedSettings, authenticatedFetch, canSyncRemote, remoteSynced, syncSession]);

  useEffect(() => {
    setFetchedModels([]);
  }, [provider]);

  useEffect(() => {
    setRemoteSynced(false);
    setRemoteConfigId(undefined);
    setLastSavedSignature("");
  }, [canSyncRemote, authIdentity]);

  const persistRemoteConfig = useCallback(async () => {
    if (!canSyncRemote) {
      showError("请先登录后再保存到后端。", "无法保存");
      return false;
    }
    if (enabled) {
      if (!hasRequiredConfig) {
        showError("请先补全必填项，再保存到后端。", "无法保存");
        return false;
      }
      setValidatingBeforeSave(true);
      try {
        const models = await fetchModelsDirectly();
        if (!models.length) {
          showError("保存前校验失败：模型列表为空，请检查请求地址与 API Key。", "校验失败");
          return false;
        }
        if (trimmedModel && !models.includes(trimmedModel)) {
          showError("保存前校验失败：当前模型不在可用列表中，请确认模型名称。", "校验失败");
          return false;
        }
      } catch {
        showError("保存前校验失败：无法连通供应商模型接口，请检查请求地址与 API Key。", "校验失败");
        return false;
      } finally {
        setValidatingBeforeSave(false);
      }
    }
    setSavingRemote(true);
    try {
      await syncSession();
      const saved = await requestSaveLlmSettings(
        {
          enabled,
          provider,
          baseUrl,
          apiKey,
          model,
          temperature,
          topP,
          maxTokens,
          seed,
        },
        authenticatedFetch,
        remoteConfigId,
      );
      applyImportedSettings(normalizeImportedSettings(saved));
      setRemoteConfigId(saved.configId);
      setLastSavedSignature(
        JSON.stringify({
          enabled: Boolean(saved.enabled),
          provider: saved.provider,
          baseUrl: String(saved.baseUrl ?? "").trim(),
          apiKey: String(saved.apiKey ?? "").trim(),
          model: String(saved.model ?? "").trim(),
          temperature: Number(saved.temperature ?? 0.1),
          topP: Number(saved.topP ?? 1),
          maxTokens: Number(saved.maxTokens ?? 2048),
          seed: Number(saved.seed ?? 42),
        }),
      );
      toast.success("已保存并同步后端大模型配置。");
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "保存失败，请稍后重试。", "保存失败");
      return false;
    } finally {
      setSavingRemote(false);
    }
  }, [
    apiKey,
    applyImportedSettings,
    authenticatedFetch,
    baseUrl,
    canSyncRemote,
    enabled,
    fetchModelsDirectly,
    hasRequiredConfig,
    maxTokens,
    model,
    provider,
    remoteConfigId,
    seed,
    showError,
    syncSession,
    temperature,
    topP,
    trimmedModel,
  ]);

  const handleSaveRemote = async () => {
    await persistRemoteConfig();
  };

  const handleConfirmReset = async () => {
    setResetConfirmOpen(false);
    if (canSyncRemote && remoteConfigId) {
      setResettingRemote(true);
      try {
        await syncSession();
        await requestDeleteLlmConfig(remoteConfigId, authenticatedFetch);
        toast.success("已清空后端自定义配置。");
      } catch (error) {
        showError(error instanceof Error ? error.message : "清空后端配置失败，请稍后重试。", "恢复默认失败");
        setResettingRemote(false);
        return;
      } finally {
        setResettingRemote(false);
      }
    }
    resetToDefaults();
    setRemoteConfigId(undefined);
    setLastSavedSignature("");
    setFetchedModels([]);
  };

  const handleTestRemote = async () => {
    if (!remoteConfigId) {
      showError("请先保存到后端，再进行连通性测试。", "无法测试");
      return;
    }
    if (hasUnsavedChanges) {
      const saved = await persistRemoteConfig();
      if (!saved) return;
    }
    setTestingRemote(true);
    try {
      await syncSession();
      const result = await requestTestLlmConfig(remoteConfigId, authenticatedFetch);
      if (result.success) {
        toast.success(result.message || "配置可用，连通性测试通过。");
      } else {
        showError(result.message || "连通性测试未通过。", "测试失败");
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "测试失败，请稍后重试。", "测试失败");
    } finally {
      setTestingRemote(false);
    }
  };

  return (
    <>
      <Card role="region" aria-labelledby="settings-subsection-llm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="inline-flex items-center gap-1.5">
            <CardTitle id="settings-subsection-llm">大模型配置</CardTitle>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="查看大模型配置说明"
                    className="text-muted-foreground -my-0.5 shrink-0"
                  >
                    <CircleHelpIcon />
                  </Button>
                }
              />
              <TooltipContent side="top" align="start" className="max-w-sm">
                配置本机使用的模型、请求地址与 API Key。
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <Button
              type="button"
              variant="default"
              size="xs"
              className="shrink-0"
              disabled={!canSaveRemote || validatingBeforeSave}
              onClick={handleSaveRemote}
            >
              {validatingBeforeSave ? "校验中..." : savingRemote ? "保存中..." : "保存到后端"}
            </Button>
          ) : null}
          {enabled ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0"
              disabled={!canTestRemote}
              onClick={handleTestRemote}
            >
              {testingRemote ? "测试中..." : "测试连接"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={handleImportClick}>
            <UploadIcon data-icon="inline-start" />
            导入 JSON
          </Button>
          <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={handleExport}>
            <DownloadIcon data-icon="inline-start" />
            导出 JSON
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="shrink-0"
            disabled={resettingRemote}
            onClick={() => setResetConfirmOpen(true)}
          >
            恢复默认
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canSyncRemote ? (
          <Alert>
            <CircleAlertIcon />
            <AlertDescription>当前为本地配置模式，登录后可读取并保存后端 `/api/llm/**` 配置。</AlertDescription>
          </Alert>
        ) : null}
        {syncingRemote ? (
          <Alert>
            <CircleAlertIcon />
            <AlertDescription>正在读取后端大模型配置...</AlertDescription>
          </Alert>
        ) : null}
        {enabled && !hasRequiredConfig ? (
          <Alert className="border-amber-500/40 text-amber-700 dark:text-amber-300">
            <CircleAlertIcon />
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              {requiredConfigHints.join("；")}。补全后可保存到后端。
            </AlertDescription>
          </Alert>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle id="settings-llm-enable">启用自定义参数</FieldTitle>
            <FieldDescription>关闭后自动回退到系统默认模型参数；你填写的 API Key 仅保存在当前浏览器本地。</FieldDescription>
          </FieldContent>
          <Switch
            checked={enabled}
            onCheckedChange={handleEnabledChange}
            aria-labelledby="settings-llm-enable"
            disabled={syncingToggleRemote}
          />
        </Field>

        <Separator />

        <FieldSet className="gap-4 border-0 p-0">
          <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="settings-llm-provider">模型供应商</FieldLabel>
              <Select
                value={provider}
                onValueChange={(v) => {
                  if (
                    v === "default" ||
                    v === "openai" ||
                    v === "anthropic" ||
                    v === "google" ||
                    v === "deepseek" ||
                    v === "aliyun" ||
                    v === "zhipu" ||
                    v === "moonshot" ||
                    v === "xai" ||
                    v === "openrouter" ||
                    v === "custom"
                  ) {
                    setProvider(v);
                  }
                }}
                disabled={!enabled}
              >
                <SelectTrigger id="settings-llm-provider" className="w-full min-w-0 max-w-xl lg:max-w-2xl">
                  {selectedProviderLogo ? (
                    <Image
                      src={`/logo/${logoTheme}/${selectedProviderLogo}.svg`}
                      alt=""
                      width={16}
                      height={16}
                      aria-hidden
                      className="shrink-0 rounded-sm"
                    />
                  ) : null}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PROVIDER_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        <span className="inline-flex items-center gap-2">
                          {PROVIDER_LOGO_NAME[item.value] ? (
                            <Image
                              src={`/logo/${logoTheme}/${PROVIDER_LOGO_NAME[item.value]}.svg`}
                              alt=""
                              width={16}
                              height={16}
                              aria-hidden
                              className="shrink-0 rounded-sm"
                            />
                          ) : null}
                          <span>{item.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="settings-llm-api-key">API Key</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="settings-llm-api-key"
                  name="llm-api-key-manual-input"
                  type={showApiKey ? "text" : "password"}
                  placeholder="例如 sk-..."
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  disabled={!enabled}
                  autoComplete="off"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  spellCheck={false}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="清空 API Key"
                    disabled={!enabled || !trimmedApiKey}
                    onClick={() => setApiKey("")}
                  >
                    ×
                  </InputGroupButton>
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                    disabled={!enabled}
                    onClick={() => setShowApiKey((prev) => !prev)}
                  >
                    {showApiKey ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <Field>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <FieldLabel htmlFor="settings-llm-base-url" className="mb-0">
                    请求地址
                  </FieldLabel>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="查看请求地址说明"
                          className="text-muted-foreground -my-0.5 shrink-0"
                        >
                          <CircleHelpIcon />
                        </Button>
                      }
                    />
                    <TooltipContent side="top" align="start" className="max-w-sm">
                      {endpointHint
                        ? `常用地址：${endpointHint.url}${endpointHint.note ? `；${endpointHint.note}` : ""}`
                        : "可填写 OpenAI 兼容网关地址。"}
                    </TooltipContent>
                  </Tooltip>
                </span>
                {endpointHint?.url ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!enabled}
                    onClick={() => setBaseUrl(endpointHint.url)}
                  >
                    填入推荐地址
                  </Button>
                ) : null}
              </div>
              <Input
                id="settings-llm-base-url"
                type="url"
                placeholder={endpointHint?.url ?? "例如 https://api.openai.com/v1"}
                value={baseUrl}
                onChange={(event) => setBaseUrl(sanitizeBaseUrlInput(event.target.value))}
                onBlur={(event) => setBaseUrl(sanitizeBaseUrlInput(event.target.value))}
                disabled={!enabled}
                autoComplete="off"
                inputMode="url"
              />
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="settings-llm-model-preset" className="mb-0">
                  主流模型模板
                </FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={!canFetchModels || loadingModels}
                  onClick={handleFetchModels}
                >
                  <RefreshCwIcon data-icon="inline-start" className={loadingModels ? "animate-spin" : ""} />
                  拉取模型列表
                </Button>
              </div>
              <Select
                value={selectedPresetValue}
                onValueChange={(v) => {
                  if (!v) return;
                  if (v !== "__custom") setModel(v);
                }}
                disabled={!enabled}
              >
                <SelectTrigger id="settings-llm-model-preset" className="w-full min-w-0 max-w-xl lg:max-w-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {mergedModelOptions.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom">自定义模型名称（手动输入）</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="settings-llm-model">模型名称</FieldLabel>
              <Input
                id="settings-llm-model"
                placeholder="例如 qwen-plus 或 deepseek-chat"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={!enabled}
                autoComplete="off"
              />
            </Field>
          </FieldGroup>
        </FieldSet>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
            {advancedOpen ? "收起高级参数" : "展开高级参数"}
            <ChevronDownIcon className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 flex flex-col gap-4">
            <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="settings-llm-temperature">Temperature</FieldLabel>
                <Input
                  id="settings-llm-temperature"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(event) => setTemperature(Number(event.target.value))}
                  disabled={!enabled}
                  inputMode="decimal"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="settings-llm-top-p">Top P</FieldLabel>
                <Input
                  id="settings-llm-top-p"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={topP}
                  onChange={(event) => setTopP(Number(event.target.value))}
                  disabled={!enabled}
                  inputMode="decimal"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="settings-llm-max-tokens">Max Tokens</FieldLabel>
                <Input
                  id="settings-llm-max-tokens"
                  type="number"
                  min={1}
                  max={32768}
                  step={1}
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(Number(event.target.value))}
                  disabled={!enabled}
                  inputMode="numeric"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="settings-llm-seed">Seed</FieldLabel>
                <Input
                  id="settings-llm-seed"
                  type="number"
                  min={0}
                  max={2147483647}
                  step={1}
                  value={seed}
                  onChange={(event) => setSeed(Number(event.target.value))}
                  disabled={!enabled}
                  inputMode="numeric"
                />
              </Field>
            </FieldGroup>

            <FieldGroup className="gap-2">
              <Field>
                <FieldLabel>快速预设</FieldLabel>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={!enabled}
                  onClick={() => {
                    setTemperature(0);
                    setTopP(1);
                  }}
                >
                  <GaugeIcon data-icon="inline-start" />
                  稳定输出
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={!enabled}
                  onClick={() => {
                    setTemperature(0.4);
                    setTopP(0.9);
                  }}
                >
                  平衡模式
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={!enabled}
                  onClick={() => {
                    setTemperature(0.8);
                    setTopP(0.95);
                  }}
                >
                  发散创意
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">范围：Temp 0-2，Top P 0-1，Tokens 1-32768，Seed 0-2147483647。</p>
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
      </Card>
      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{errorDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap break-all">
              {errorDialogMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialogOpen(false)}>我知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认恢复默认配置？</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap break-all">
              该操作会清空当前用户的后端自定义大模型配置，并将页面参数恢复为默认值。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant="outline" onClick={() => setResetConfirmOpen(false)}>
              取消
            </AlertDialogAction>
            <AlertDialogAction variant="destructive" onClick={handleConfirmReset}>
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
