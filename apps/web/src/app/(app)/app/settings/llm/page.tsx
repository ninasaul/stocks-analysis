"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BotIcon, CheckIcon, CircleAlertIcon, EyeIcon, EyeOffIcon, PencilIcon, PlayIcon, PlusIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/use-auth-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useLlmRuntimeOptionsStore, type LlmProviderOption } from "@/stores/use-llm-runtime-options-store";
import {
  requestDeleteLlmConfig,
  requestLlmConfigById,
  requestLlmPresets,
  requestSaveLlmSettings,
  requestSetLlmPresetPreference,
  requestSetUserLlmPreference,
  requestTestLlmConfig,
  requestUserLlmConfig,
  requestUserLlmConfigs,
  requestUserLlmPreference,
} from "@/lib/api/llm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ConfigOption = { id: number; name: string; provider: LlmProviderOption; isActive: boolean };
type SystemPresetOption = { id: number; name: string; provider: LlmProviderOption; model: string; isActive: boolean };
type DeleteTargetConfig = Pick<ConfigOption, "id" | "name">;
type AdvancedPresetKey = "precise" | "balanced" | "creative" | "long";
type ProviderLogo = { light: string; dark: string };

const PROVIDERS: { value: LlmProviderOption; label: string }[] = [
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

const PROVIDER_LOGOS: Partial<Record<LlmProviderOption, ProviderLogo>> = {
  openai: { light: "/logo/light/ChatGPT.svg", dark: "/logo/dark/ChatGPT.svg" },
  anthropic: { light: "/logo/light/anthropic.svg", dark: "/logo/dark/anthropic.svg" },
  google: { light: "/logo/light/Gemini.svg", dark: "/logo/dark/Gemini.svg" },
  deepseek: { light: "/logo/light/DeepSeek.svg", dark: "/logo/dark/DeepSeek.svg" },
  aliyun: { light: "/logo/light/Qwen.svg", dark: "/logo/dark/Qwen.svg" },
  zhipu: { light: "/logo/light/bigmodel.svg", dark: "/logo/dark/bigmodel.svg" },
  moonshot: { light: "/logo/light/Kimi.svg", dark: "/logo/dark/Kimi.svg" },
  xai: { light: "/logo/light/Grok.svg", dark: "/logo/dark/Grok.svg" },
};

function inferProviderFromModelName(modelName: string): LlmProviderOption {
  const name = modelName.toLowerCase();
  if (name.includes("gpt") || name.includes("openai")) return "openai";
  if (name.includes("claude") || name.includes("anthropic")) return "anthropic";
  if (name.includes("gemini") || name.includes("google")) return "google";
  if (name.includes("deepseek")) return "deepseek";
  if (name.includes("qwen") || name.includes("aliyun") || name.includes("通义")) return "aliyun";
  if (name.includes("glm") || name.includes("zhipu") || name.includes("智谱")) return "zhipu";
  if (name.includes("kimi") || name.includes("moonshot")) return "moonshot";
  if (name.includes("grok") || name.includes("xai")) return "xai";
  if (name.includes("openrouter")) return "openrouter";
  return "custom";
}

function ProviderLogoIcon({ provider, label, className = "size-4" }: { provider: LlmProviderOption; label: string; className?: string }) {
  const logo = PROVIDER_LOGOS[provider];
  if (!logo) {
    return (
      <>
        <BotIcon aria-hidden="true" className={`${className} shrink-0 text-muted-foreground`} />
        <span className="sr-only">{label}</span>
      </>
    );
  }

  return (
    <>
      <Image src={logo.light} alt="" aria-hidden="true" width={24} height={24} className={`${className} shrink-0 dark:hidden`} />
      <Image src={logo.dark} alt="" aria-hidden="true" width={24} height={24} className={`hidden ${className} shrink-0 dark:block`} />
      <span className="sr-only">{label}</span>
    </>
  );
}

function ProviderOptionLabel({ provider, label }: { provider: LlmProviderOption; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ProviderLogoIcon provider={provider} label={label} />
      <span className="truncate">{label}</span>
    </span>
  );
}

const ADVANCED_PARAMETER_PRESETS: {
  key: AdvancedPresetKey;
  label: string;
  description: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  seed: number;
}[] = [
  { key: "precise", label: "精准", description: "稳定、少发散", temperature: 0.1, topP: 0.8, maxTokens: 2048, seed: 42 },
  { key: "balanced", label: "均衡", description: "通用默认", temperature: 0.7, topP: 0.9, maxTokens: 4096, seed: 42 },
  { key: "creative", label: "创意", description: "更开放", temperature: 1, topP: 1, maxTokens: 4096, seed: 42 },
  { key: "long", label: "长文本", description: "提高输出长度", temperature: 0.4, topP: 0.9, maxTokens: 8192, seed: 42 },
];

function sanitizeBaseUrlInput(input: string): string {
  let value = input.replace(/\u3000/g, " ").trim().replace(/^['"`]+|['"`]+$/g, "").replace(/\s+/g, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value) && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(value)) value = `https://${value}`;
  return value.replace(/\/+$/, "");
}

function parseModelNames(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as {
    data?: Array<{ id?: string; name?: string } | string>;
    models?: Array<{ id?: string; name?: string } | string>;
    items?: Array<{ id?: string; name?: string } | string>;
  };
  const collect = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const row = item as { id?: string; name?: string };
          return String(row.id ?? row.name ?? "").trim();
        }
        return "";
      })
      .filter(Boolean);
  };
  return [...new Set([...collect(obj.data), ...collect(obj.models), ...collect(obj.items)])];
}

export default function SettingsLlmPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [syncingRemote, setSyncingRemote] = useState(false);
  const [savingRemote, setSavingRemote] = useState(false);
  const [testingRemote, setTestingRemote] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<number | null>(null);
  const [settingPresetId, setSettingPresetId] = useState<number | null>(null);
  const [openingConfigId, setOpeningConfigId] = useState<number | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [showValidationHint, setShowValidationHint] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [configOptions, setConfigOptions] = useState<ConfigOption[]>([]);
  const [systemPresetOptions, setSystemPresetOptions] = useState<SystemPresetOption[]>([]);
  const [deleteTargetConfig, setDeleteTargetConfig] = useState<DeleteTargetConfig | null>(null);
  const [defaultConfigId, setDefaultConfigId] = useState<number | undefined>();
  const [defaultPresetId, setDefaultPresetId] = useState<number | undefined>();
  const [remoteConfigId, setRemoteConfigId] = useState<number | undefined>();
  const [configName, setConfigName] = useState("");
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);

  const authHydrated = useStoreHydrated(useAuthStore);
  const session = useAuthStore((s) => s.session);
  const syncSession = useAuthStore((s) => s.syncSession);
  const authenticatedFetch = useAuthStore((s) => s.authenticatedFetch);
  const canSyncRemote = authHydrated && session === "user";

  const provider = useLlmRuntimeOptionsStore((s) => s.provider);
  const baseUrl = useLlmRuntimeOptionsStore((s) => s.baseUrl);
  const apiKey = useLlmRuntimeOptionsStore((s) => s.apiKey);
  const model = useLlmRuntimeOptionsStore((s) => s.model);
  const temperature = useLlmRuntimeOptionsStore((s) => s.temperature);
  const topP = useLlmRuntimeOptionsStore((s) => s.topP);
  const maxTokens = useLlmRuntimeOptionsStore((s) => s.maxTokens);
  const seed = useLlmRuntimeOptionsStore((s) => s.seed);
  const setProvider = useLlmRuntimeOptionsStore((s) => s.setProvider);
  const setBaseUrl = useLlmRuntimeOptionsStore((s) => s.setBaseUrl);
  const setApiKey = useLlmRuntimeOptionsStore((s) => s.setApiKey);
  const setModel = useLlmRuntimeOptionsStore((s) => s.setModel);
  const setTemperature = useLlmRuntimeOptionsStore((s) => s.setTemperature);
  const setTopP = useLlmRuntimeOptionsStore((s) => s.setTopP);
  const setMaxTokens = useLlmRuntimeOptionsStore((s) => s.setMaxTokens);
  const setSeed = useLlmRuntimeOptionsStore((s) => s.setSeed);
  const resetToDefaults = useLlmRuntimeOptionsStore((s) => s.resetToDefaults);

  const requiredHints = useMemo(() => {
    const missing: string[] = [];
    if (!configName.trim()) missing.push("配置名称");
    if (!baseUrl.trim()) missing.push("请求地址");
    if (!apiKey.trim()) missing.push("API Key");
    if (!model.trim()) missing.push("模型名称");
    return missing;
  }, [configName, baseUrl, apiKey, model]);

  const modelOptions = useMemo(() => [...new Set(fetchedModels)], [fetchedModels]);
  const providerLabel = useMemo(() => PROVIDERS.find((item) => item.value === provider)?.label ?? provider, [provider]);
  const selectedModelListValue = modelOptions.includes(model) ? model : "__custom";
  const selectedModelListLabel = selectedModelListValue === "__custom" ? "手动输入" : selectedModelListValue;
  const activeAdvancedPreset = useMemo(() => {
    const match = ADVANCED_PARAMETER_PRESETS.find(
      (preset) =>
        preset.temperature === temperature &&
        preset.topP === topP &&
        preset.maxTokens === maxTokens &&
        preset.seed === seed,
    );
    return match?.key;
  }, [maxTokens, seed, temperature, topP]);
  const showFieldValidation = showValidationHint;
  const configNameInvalid = showFieldValidation && !configName.trim();
  const baseUrlInvalid = showFieldValidation && !baseUrl.trim();
  const apiKeyInvalid = showFieldValidation && !apiKey.trim();
  const modelInvalid = showFieldValidation && !model.trim();

  const hydrateFromRemote = useCallback(async () => {
    await syncSession();
    const [configs, preference, presets] = await Promise.all([
      requestUserLlmConfigs(authenticatedFetch),
      requestUserLlmPreference(authenticatedFetch),
      requestLlmPresets(authenticatedFetch).catch(() => []),
    ]);

    setConfigOptions(configs.map((item) => ({ id: item.id, name: item.name, provider: item.provider, isActive: item.isActive })));
    setSystemPresetOptions(
      presets.map((item) => ({ id: item.id, name: item.name, provider: item.provider, model: item.model, isActive: item.isActive })),
    );

    const currentConfigId = preference.configId;
    const currentPresetId = preference.presetId;
    setDefaultConfigId(currentConfigId);
    setDefaultPresetId(currentPresetId);
    setRemoteConfigId(currentConfigId);
    setCreatingNew(false);

    if (!currentConfigId) {
      setConfigName("");
      return { configs, currentConfigId };
    }

    const config = await requestLlmConfigById(currentConfigId, authenticatedFetch);
    if (!config) {
      setConfigName("");
      return { configs, currentConfigId };
    }

    setConfigName(String(config.name ?? ""));
    setProvider(config.provider ?? "custom");
    setBaseUrl(String(config.base_url ?? ""));
    setApiKey(String(config.api_key ?? ""));
    setModel(String(config.model ?? ""));
    setTemperature(Number(config.config?.temperature ?? 0.1));
    setTopP(Number(config.config?.topP ?? config.config?.top_p ?? 1));
    setMaxTokens(Number(config.config?.maxTokens ?? config.config?.max_tokens ?? 2048));
    setSeed(Number(config.config?.seed ?? 42));

    return { configs, currentConfigId };
  }, [
    authenticatedFetch,
    setApiKey,
    setBaseUrl,
    setMaxTokens,
    setModel,
    setProvider,
    setSeed,
    setTemperature,
    setTopP,
    syncSession,
  ]);

  useEffect(() => {
    if (!canSyncRemote) return;
    let cancelled = false;
    void (async () => {
      setSyncingRemote(true);
      try {
        await hydrateFromRemote();
        if (cancelled) return;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "读取后端配置失败");
      } finally {
        if (!cancelled) setSyncingRemote(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedFetch, canSyncRemote, hydrateFromRemote]);

  const handleSaveConfig = async () => {
    setShowValidationHint(true);
    if (requiredHints.length > 0) {
      toast.error(`请先补全：${requiredHints.join("、")}`);
      return;
    }
    setSavingRemote(true);
    try {
      await syncSession();
      const saved = await requestSaveLlmSettings(
        { enabled: true, provider, baseUrl, apiKey, model, temperature, topP, maxTokens, seed },
        authenticatedFetch,
        creatingNew ? undefined : remoteConfigId,
        configName,
      );
      if (saved.configId) {
        await requestSetUserLlmPreference(saved.configId, authenticatedFetch);
      }
      await hydrateFromRemote();
      setCreatingNew(false);
      setConfigDialogOpen(false);
      setShowValidationHint(false);
      toast.success("配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存配置失败");
    } finally {
      setSavingRemote(false);
    }
  };

  const handleFetchModels = async () => {
    const normalizedBaseUrl = sanitizeBaseUrlInput(baseUrl);
    if (!normalizedBaseUrl) {
      toast.error("请先填写请求地址");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("请先填写 API Key");
      return;
    }

    setBaseUrl(normalizedBaseUrl);
    setLoadingModels(true);
    try {
      const response = await fetch(`${normalizedBaseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`模型列表拉取失败（${response.status}）`);

      const payload = (await response.json()) as unknown;
      const names = parseModelNames(payload);
      if (names.length === 0) {
        throw new Error("未读取到可用模型");
      }

      setFetchedModels(names);
      if (!model.trim() || !names.includes(model)) {
        setModel(names[0]);
      }
      toast.success(`已拉取 ${names.length} 个模型`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模型列表拉取失败");
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTestConfig = async () => {
    if (!remoteConfigId || creatingNew) {
      toast.error("请先保存配置后再测试连接");
      return;
    }

    setTestingRemote(true);
    try {
      await syncSession();
      const result = await requestTestLlmConfig(remoteConfigId, authenticatedFetch);
      if (result.success) {
        toast.success(result.message || "测试通过");
        return;
      }
      toast.error(result.message || "测试失败");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试连接失败");
    } finally {
      setTestingRemote(false);
    }
  };

  const applyAdvancedPreset = (presetKey: AdvancedPresetKey) => {
    const preset = ADVANCED_PARAMETER_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    setTemperature(preset.temperature);
    setTopP(preset.topP);
    setMaxTokens(preset.maxTokens);
    setSeed(preset.seed);
  };

  const openCreateDialog = () => {
    setCreatingNew(true);
    setRemoteConfigId(undefined);
    setConfigName("");
    setFetchedModels([]);
    resetToDefaults();
    setProvider("openai");
    setShowValidationHint(false);
    setConfigDialogOpen(true);
  };

  const openEditDialog = async (configId: number) => {
    setOpeningConfigId(configId);
    try {
      await syncSession();
      const settings = await requestUserLlmConfig(configId, authenticatedFetch);
      setCreatingNew(false);
      setRemoteConfigId(settings.configId);
      setConfigName(String(settings.configName ?? ""));
      setProvider(settings.provider);
      setBaseUrl(String(settings.baseUrl ?? ""));
      setApiKey(String(settings.apiKey ?? ""));
      setModel(String(settings.model ?? ""));
      setTemperature(Number(settings.temperature ?? 0.1));
      setTopP(Number(settings.topP ?? 1));
      setMaxTokens(Number(settings.maxTokens ?? 2048));
      setSeed(Number(settings.seed ?? 42));
      setFetchedModels([]);
      setShowValidationHint(false);
      setConfigDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取配置失败");
    } finally {
      setOpeningConfigId(null);
    }
  };

  const handleDeleteConfig = async (configId: number) => {
    try {
      await syncSession();
      await requestDeleteLlmConfig(configId, authenticatedFetch);
      await hydrateFromRemote();
      if (remoteConfigId === configId) {
        setRemoteConfigId(undefined);
        setConfigName("");
      }
      toast.success("配置已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除配置失败");
    } finally {
      setDeleteTargetConfig(null);
    }
  };

  const handleActivateConfig = async (configId: number) => {
    try {
      setSettingDefaultId(configId);
      setCreatingNew(false);
      await requestSetUserLlmPreference(configId, authenticatedFetch);
      await hydrateFromRemote();
      toast.success("已启用该配置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启用配置失败");
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleActivatePreset = async (presetId: number) => {
    try {
      setSettingPresetId(presetId);
      setCreatingNew(false);
      await requestSetLlmPresetPreference(presetId, authenticatedFetch);
      await hydrateFromRemote();
      toast.success("已启用系统预设");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启用系统预设失败");
    } finally {
      setSettingPresetId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4" role="region" aria-labelledby="settings-subsection-llm">
      <div className="grid gap-4">
        <Card size="sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle id="settings-subsection-llm">大模型配置</CardTitle>
              <CardDescription>管理自定义大模型连接配置，用户偏好选中的自定义配置将作为系统默认大模型使用。</CardDescription>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={openCreateDialog}
            >
              <PlusIcon data-icon="inline-start" />
              添加自定义
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!canSyncRemote ? (
              <Alert>
                <CircleAlertIcon />
                <AlertDescription>当前未登录，仅可本地编辑；登录后可同步后端配置。</AlertDescription>
              </Alert>
            ) : null}
            {syncingRemote ? (
              <Alert>
                <CircleAlertIcon />
                <AlertDescription>正在同步后端配置...</AlertDescription>
              </Alert>
            ) : null}
            {systemPresetOptions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">系统预设模型</p>
                {systemPresetOptions.map((item) => {
                  const isActivePreset = defaultPresetId === item.id;
                  const iconProvider = inferProviderFromModelName(item.name);
                  const providerName = PROVIDERS.find((providerOption) => providerOption.value === item.provider)?.label ?? item.provider;

                  return (
                    <div key={`preset-${item.id}`} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center">
                          <ProviderLogoIcon provider={iconProvider} label={providerName} className="size-7" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            {isActivePreset ? (
                              <Badge variant="secondary">
                                <CheckIcon data-icon="inline-start" />
                                启用中
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground">{providerName}{item.model ? ` · ${item.model}` : ""}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Button
                          variant={isActivePreset ? "secondary" : "outline"}
                          size="xs"
                          disabled={settingPresetId === item.id || isActivePreset}
                          onClick={() => {
                            void handleActivatePreset(item.id);
                          }}
                        >
                          <PlayIcon data-icon="inline-start" />
                          {settingPresetId === item.id ? "启用中" : isActivePreset ? "已启用" : "启用"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <p className="pt-1 text-sm font-medium text-foreground">用户自定义配置</p>
            {configOptions.map((item) => {
              const isActivePreference = defaultConfigId === item.id;
              const providerName = PROVIDERS.find((providerOption) => providerOption.value === item.provider)?.label ?? item.provider;

              return (
                <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center">
                      <ProviderLogoIcon provider={item.provider} label={providerName} className="size-7" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        {isActivePreference ? (
                          <Badge variant="secondary">
                            <CheckIcon data-icon="inline-start" />
                            启用中
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{providerName}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button
                      variant={isActivePreference ? "secondary" : "outline"}
                      size="xs"
                      disabled={settingDefaultId === item.id || isActivePreference}
                      onClick={() => {
                        void handleActivateConfig(item.id);
                      }}
                    >
                      <PlayIcon data-icon="inline-start" />
                      {settingDefaultId === item.id ? "启用中" : isActivePreference ? "已启用" : "启用"}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="outline"
                            size="icon-xs"
                            aria-label={`编辑 ${item.name}`}
                            disabled={openingConfigId === item.id}
                            onClick={() => {
                              void openEditDialog(item.id);
                            }}
                          >
                            {openingConfigId === item.id ? <Spinner /> : <PencilIcon />}
                          </Button>
                        }
                      />
                      <TooltipContent>编辑</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="destructive"
                            size="icon-xs"
                            aria-label={`删除 ${item.name}`}
                            onClick={() => setDeleteTargetConfig({ id: item.id, name: item.name })}
                          >
                            <TrashIcon />
                          </Button>
                        }
                      />
                      <TooltipContent>删除</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
            {configOptions.length === 0 ? (
              <Empty className="min-h-40">
                <EmptyHeader>
                  <EmptyTitle>暂无用户配置</EmptyTitle>
                  <EmptyDescription>创建第一条配置后，可将它设为默认模型。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </CardContent>
        </Card>

        <AlertDialog open={Boolean(deleteTargetConfig)} onOpenChange={(open) => {
          if (!open) setDeleteTargetConfig(null);
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除配置？</AlertDialogTitle>
              <AlertDialogDescription>
                删除后无法恢复。确认删除「{deleteTargetConfig?.name ?? ""}」吗？
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (!deleteTargetConfig) return;
                  void handleDeleteConfig(deleteTargetConfig.id);
                }}
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={configDialogOpen}
          onOpenChange={(open) => {
            setConfigDialogOpen(open);
            if (!open && !savingRemote) setShowValidationHint(false);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
              <DialogTitle>{creatingNew ? "新建配置" : "编辑配置"}</DialogTitle>
              <DialogDescription>
                {creatingNew ? "填写连接信息并保存为新的用户配置。" : "修改当前配置的连接信息、模型和参数。"}
              </DialogDescription>
          </DialogHeader>
          <form
            id="llm-config-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveConfig();
            }}
          >
            <FieldGroup>
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={configNameInvalid || undefined}>
                    <FieldLabel htmlFor="llm-config-name">配置名称</FieldLabel>
                    <Input
                      id="llm-config-name"
                      placeholder="例如：OpenAI 主配置"
                      value={configName}
                      onChange={(e) => setConfigName(e.target.value)}
                      aria-invalid={configNameInvalid || undefined}
                    />
                    {configNameInvalid ? <FieldError>请输入配置名称。</FieldError> : null}
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="llm-provider">供应商</FieldLabel>
                    <Select value={provider} onValueChange={(v) => setProvider(v as LlmProviderOption)}>
                      <SelectTrigger id="llm-provider">
                        <SelectValue>
                          <ProviderOptionLabel provider={provider} label={providerLabel} />
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {PROVIDERS.map((x) => (
                            <SelectItem key={x.value} value={x.value}>
                              <ProviderOptionLabel provider={x.value} label={x.label} />
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field data-invalid={apiKeyInvalid || undefined}>
                    <FieldLabel htmlFor="llm-api-key">API Key</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="llm-api-key"
                        type={showApiKey ? "text" : "password"}
                        placeholder="sk-..."
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        aria-invalid={apiKeyInvalid || undefined}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          size="icon-xs"
                          aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                          onClick={() => setShowApiKey((x) => !x)}
                        >
                          {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    {apiKeyInvalid ? <FieldError>请输入 API Key。</FieldError> : null}
                  </Field>

                  <Field data-invalid={baseUrlInvalid || undefined}>
                    <FieldLabel htmlFor="llm-base-url">请求地址</FieldLabel>
                    <Input
                      id="llm-base-url"
                      placeholder="https://api.openai.com/v1"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      onBlur={(e) => setBaseUrl(sanitizeBaseUrlInput(e.target.value))}
                      aria-invalid={baseUrlInvalid || undefined}
                    />
                    {baseUrlInvalid ? <FieldError>请输入请求地址。</FieldError> : null}
                  </Field>

                  <Field>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor="llm-model-list">模型列表</FieldLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={loadingModels || savingRemote || testingRemote}
                        onClick={() => {
                          void handleFetchModels();
                        }}
                      >
                        {loadingModels ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                        {loadingModels ? "拉取中" : "拉取"}
                      </Button>
                    </div>
                    <Select
                      value={selectedModelListValue}
                      onValueChange={(v) => {
                        if (v && v !== "__custom") setModel(v);
                      }}
                    >
                      <SelectTrigger id="llm-model-list" className="w-full">
                        <SelectValue>{selectedModelListLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {modelOptions.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                          <SelectItem value="__custom">手动输入</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field data-invalid={modelInvalid || undefined}>
                    <FieldLabel htmlFor="llm-model">模型名称</FieldLabel>
                    <Input
                      id="llm-model"
                      placeholder="例如：gpt-4o-mini"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      aria-invalid={modelInvalid || undefined}
                    />
                    {modelInvalid ? <FieldError>请输入模型名称。</FieldError> : null}
                  </Field>
                </FieldGroup>

                <Accordion>
                  <AccordionItem value="advanced">
                    <AccordionTrigger>高级参数</AccordionTrigger>
                    <AccordionContent>
                      <FieldSet>
                        <FieldGroup className="grid gap-4 sm:grid-cols-2">
                          <Field className="sm:col-span-2">
                            <FieldLabel>快捷预设</FieldLabel>
                            <div className="flex flex-wrap gap-2">
                              {ADVANCED_PARAMETER_PRESETS.map((preset) => (
                                <Button
                                  key={preset.key}
                                  type="button"
                                  size="xs"
                                  variant={activeAdvancedPreset === preset.key ? "secondary" : "outline"}
                                  aria-label={`${preset.label}：${preset.description}`}
                                  onClick={() => applyAdvancedPreset(preset.key)}
                                >
                                  {preset.label}
                                </Button>
                              ))}
                            </div>
                          </Field>

                          <FieldGroup className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                            <Field>
                              <FieldLabel htmlFor="llm-temperature">Temperature</FieldLabel>
                              <Input
                                id="llm-temperature"
                                type="number"
                                placeholder="0.1"
                                min={0}
                                max={2}
                                step={0.1}
                                value={temperature}
                                onChange={(e) => setTemperature(Number(e.target.value))}
                              />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="llm-top-p">Top P</FieldLabel>
                              <Input
                                id="llm-top-p"
                                type="number"
                                placeholder="1"
                                min={0}
                                max={1}
                                step={0.1}
                                value={topP}
                                onChange={(e) => setTopP(Number(e.target.value))}
                              />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="llm-max-tokens">Max Tokens</FieldLabel>
                              <Input
                                id="llm-max-tokens"
                                type="number"
                                placeholder="2048"
                                min={1}
                                value={maxTokens}
                                onChange={(e) => setMaxTokens(Number(e.target.value))}
                              />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="llm-seed">Seed</FieldLabel>
                              <Input
                                id="llm-seed"
                                type="number"
                                placeholder="42"
                                min={0}
                                value={seed}
                                onChange={(e) => setSeed(Number(e.target.value))}
                              />
                            </Field>
                          </FieldGroup>
                        </FieldGroup>
                      </FieldSet>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FieldGroup>
            <DialogFooter>
              {remoteConfigId && !creatingNew ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    try {
                      await syncSession();
                      await requestDeleteLlmConfig(remoteConfigId, authenticatedFetch);
                      await hydrateFromRemote();
                      setConfigDialogOpen(false);
                      toast.success("配置已删除");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "删除配置失败");
                    }
                  }}
                >
                  删除配置
                </Button>
              ) : null}
              <DialogClose render={<Button type="button" variant="outline" size="sm" disabled={savingRemote} />}>取消</DialogClose>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canSyncRemote || !remoteConfigId || creatingNew || testingRemote || savingRemote || loadingModels}
                onClick={() => {
                  void handleTestConfig();
                }}
              >
                {testingRemote ? <Spinner data-icon="inline-start" /> : null}
                {testingRemote ? "测试中..." : "测试连接"}
              </Button>
              <Button type="submit" size="sm" disabled={!canSyncRemote || savingRemote || testingRemote || loadingModels}>
                {savingRemote ? <Spinner data-icon="inline-start" /> : null}
                {savingRemote ? "保存中..." : "保存配置"}
              </Button>
            </DialogFooter>
          </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
