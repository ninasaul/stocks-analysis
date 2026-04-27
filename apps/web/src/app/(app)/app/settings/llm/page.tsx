"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import {
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
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLegend,
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
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
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

  const applyImportedSettings = (snapshot: LlmRuntimeOptionsState) => {
    setEnabled(snapshot.enabled);
    setProvider(snapshot.provider);
    setBaseUrl(snapshot.baseUrl);
    setApiKey(snapshot.apiKey);
    setModel(snapshot.model);
    setTemperature(snapshot.temperature);
    setTopP(snapshot.topP);
    setMaxTokens(snapshot.maxTokens);
    setSeed(snapshot.seed);
  };

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
      toast.error("导入失败，请检查 JSON 格式后重试。");
    } finally {
      event.target.value = "";
    }
  };

  const handleFetchModels = async () => {
    if (!enabled) {
      toast.error("请先启用自定义参数。");
      return;
    }
    if (!baseUrl.trim()) {
      toast.error("请先填写请求地址。");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("请先填写 API Key。");
      return;
    }
    setLoadingModels(true);
    try {
      const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
      const modelUrl = normalizedBase.endsWith("/models") ? normalizedBase : `${normalizedBase}/models`;
      const response = await fetch(modelUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        data?: Array<{ id?: string }>;
        models?: Array<{ id?: string; name?: string }>;
      };
      const fromData = Array.isArray(payload.data)
        ? payload.data.map((x) => String(x?.id ?? "").trim()).filter(Boolean)
        : [];
      const fromModels = Array.isArray(payload.models)
        ? payload.models
            .map((x) => String(x?.id ?? x?.name ?? "").trim())
            .filter(Boolean)
        : [];
      const list = [...new Set([...fromData, ...fromModels])];
      if (!list.length) {
        throw new Error("empty_models");
      }
      setFetchedModels(list);
      toast.success(`已拉取 ${list.length} 个模型。`);
    } catch {
      toast.error("模型列表拉取失败，请检查请求地址、API Key 或跨域策略。");
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <Card role="region" aria-labelledby="settings-subsection-llm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle id="settings-subsection-llm">大模型配置</CardTitle>
          <CardDescription>配置本机使用的模型、地址与 API Key。</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={handleImportClick}>
            <UploadIcon data-icon="inline-start" />
            导入 JSON
          </Button>
          <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={handleExport}>
            <DownloadIcon data-icon="inline-start" />
            导出 JSON
          </Button>
          <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={() => resetToDefaults()}>
            恢复默认
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
            <FieldDescription>关闭时使用默认模板；API Key 仅保存在当前浏览器。</FieldDescription>
          </FieldContent>
          <Switch
            checked={enabled}
            onCheckedChange={(next) => setEnabled(Boolean(next))}
            aria-labelledby="settings-llm-enable"
          />
        </Field>

        <Separator />

        <FieldSet className="gap-4 border-0 p-0">
          <FieldLegend variant="label" className="px-0">
            连接
          </FieldLegend>
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
              <FieldLabel htmlFor="settings-llm-base-url">请求地址</FieldLabel>
              <FieldDescription>
                {endpointHint
                  ? `常用地址：${endpointHint.url}${endpointHint.note ? `；${endpointHint.note}` : ""}`
                  : "可填写 OpenAI 兼容网关地址。"}
              </FieldDescription>
              <Input
                id="settings-llm-base-url"
                type="url"
                placeholder={endpointHint?.url ?? "例如 https://api.openai.com/v1"}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                disabled={!enabled}
                autoComplete="off"
                inputMode="url"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="settings-llm-api-key">API Key</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="settings-llm-api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="例如 sk-..."
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  disabled={!enabled}
                  autoComplete="new-password"
                />
                <InputGroupAddon align="inline-end">
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
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="settings-llm-model-preset" className="mb-0">
                  主流模型模板
                </FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={!enabled || loadingModels}
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
                  if (v === "__custom") {
                    setModel("");
                    return;
                  }
                  setModel(v);
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
  );
}
