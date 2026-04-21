"use client";

import Link from "next/link";
import {
  ANALYZE_DEPTH_SUMMARY,
  ANALYZE_MODEL_OPTIONS,
  type AnalyzePreferenceAnalystRole,
  type AnalyzePreferenceLanguage,
} from "@/lib/analyze-preferences-schema";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAnalyzePreferencesStore } from "@/stores/use-analyze-preferences-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
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
import { PageLoadingState } from "@/components/features/page-state";

const ANALYST_OPTIONS: {
  id: AnalyzePreferenceAnalystRole;
  title: string;
  description: string;
}[] = [
  { id: "market", title: "市场分析师", description: "趋势结构、行业与宏观环境" },
  { id: "fundamental", title: "基本面分析师", description: "财务质量、商业模式与竞争壁垒" },
  { id: "news", title: "新闻分析师", description: "公告、新闻与事件驱动线索" },
  { id: "social", title: "社媒分析师", description: "舆情与情绪线索（A 股标的中会在分析弹窗内自动关闭）" },
];

const languageLabels: Record<AnalyzePreferenceLanguage, string> = {
  zh: "中文",
  en: "English",
};

export function AnalyzePreferencesSettings() {
  const hydrated = useStoreHydrated(useAnalyzePreferencesStore);
  const depth = useAnalyzePreferencesStore((s) => s.depth);
  const analystRoles = useAnalyzePreferencesStore((s) => s.analystRoles);
  const quickModel = useAnalyzePreferencesStore((s) => s.quickModel);
  const deepModel = useAnalyzePreferencesStore((s) => s.deepModel);
  const sentiment = useAnalyzePreferencesStore((s) => s.sentiment);
  const riskAssessment = useAnalyzePreferencesStore((s) => s.riskAssessment);
  const language = useAnalyzePreferencesStore((s) => s.language);
  const setDepth = useAnalyzePreferencesStore((s) => s.setDepth);
  const toggleAnalystRole = useAnalyzePreferencesStore((s) => s.toggleAnalystRole);
  const setQuickModel = useAnalyzePreferencesStore((s) => s.setQuickModel);
  const setDeepModel = useAnalyzePreferencesStore((s) => s.setDeepModel);
  const setSentiment = useAnalyzePreferencesStore((s) => s.setSentiment);
  const setRiskAssessment = useAnalyzePreferencesStore((s) => s.setRiskAssessment);
  const setLanguage = useAnalyzePreferencesStore((s) => s.setLanguage);
  const resetToDefaults = useAnalyzePreferencesStore((s) => s.resetToDefaults);

  if (!hydrated) {
    return (
      <Card role="region" aria-labelledby="settings-subsection-analysis-prefs">
        <CardHeader>
          <CardTitle id="settings-subsection-analysis-prefs">分析偏好</CardTitle>
          <CardDescription>默认分析深度、团队与模型；在未关联选股偏好时用于股票预测。</CardDescription>
        </CardHeader>
        <CardContent>
          <PageLoadingState title="正在加载分析偏好" description="正在读取本机保存的默认配置。" />
        </CardContent>
      </Card>
    );
  }

  const analystSet = new Set(analystRoles);

  return (
    <Card role="region" aria-labelledby="settings-subsection-analysis-prefs">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle id="settings-subsection-analysis-prefs">分析偏好</CardTitle>
          <CardDescription>
            配置股票预测的默认分析深度、分析师团队、模型与报告语言。未关联选股偏好时，「分析配置」弹窗会以此为准；每次成功生成报告后也会用当次配置覆盖此处，便于下次沿用。
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => resetToDefaults()}>
          恢复默认
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldSet className="min-w-0 gap-3 border-0 p-0">
          <FieldLegend variant="label" className="px-0">
            默认分析深度
          </FieldLegend>
          <Select
            value={String(depth)}
            onValueChange={(v) => {
              const n = Number(v);
              if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) setDepth(n);
            }}
          >
            <SelectTrigger className="w-full min-w-0 max-w-xl lg:max-w-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {([1, 2, 3, 4, 5] as const).map((d) => {
                  const meta = ANALYZE_DEPTH_SUMMARY[d];
                  return (
                    <SelectItem key={d} value={String(d)}>
                      {meta.title}（{meta.hint}）
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FieldSet>

        <Separator />

        <FieldSet className="min-w-0 gap-3 border-0 p-0">
          <FieldLegend variant="label" className="px-0">
            默认分析师团队
          </FieldLegend>
          <FieldGroup className="grid gap-2 sm:grid-cols-2">
            {ANALYST_OPTIONS.map((row) => {
              const checked = analystSet.has(row.id);
              const boxId = `settings-analyst-${row.id}`;
              return (
                <Field key={row.id} orientation="horizontal" className="items-start gap-3 rounded-lg border p-3">
                  <Checkbox
                    id={boxId}
                    checked={checked}
                    onCheckedChange={() => toggleAnalystRole(row.id)}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <FieldLabel htmlFor={boxId} className="cursor-pointer leading-snug">
                      <span className="font-medium">{row.title}</span>
                    </FieldLabel>
                    <FieldDescription>{row.description}</FieldDescription>
                  </div>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>

        <Separator />

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="settings-model-quick">快模型</FieldLabel>
            <Select value={quickModel} onValueChange={(v) => v && setQuickModel(v as (typeof ANALYZE_MODEL_OPTIONS)[number])}>
              <SelectTrigger id="settings-model-quick" className="w-full min-w-0 max-w-xl lg:max-w-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ANALYZE_MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="settings-model-deep">深决策模型</FieldLabel>
            <Select value={deepModel} onValueChange={(v) => v && setDeepModel(v as (typeof ANALYZE_MODEL_OPTIONS)[number])}>
              <SelectTrigger id="settings-model-deep" className="w-full min-w-0 max-w-xl lg:max-w-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ANALYZE_MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <Separator />

        <FieldGroup className="gap-4">
          <Field orientation="responsive">
            <FieldContent>
              <FieldTitle>情绪分析</FieldTitle>
              <FieldDescription>开启后报告纳入情绪与风险偏好相关结论。</FieldDescription>
            </FieldContent>
            <Switch checked={sentiment} onCheckedChange={(v) => setSentiment(Boolean(v))} />
          </Field>
          <Field orientation="responsive">
            <FieldContent>
              <FieldTitle>风险评估</FieldTitle>
              <FieldDescription>开启后输出波动、仓位与失效条件等风险提示。</FieldDescription>
            </FieldContent>
            <Switch checked={riskAssessment} onCheckedChange={(v) => setRiskAssessment(Boolean(v))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="settings-lang">报告语言</FieldLabel>
            <Select
              value={language}
              onValueChange={(v) => {
                if (v === "zh" || v === "en") setLanguage(v);
              }}
            >
              <SelectTrigger id="settings-lang" className="w-full min-w-0 max-w-xl lg:max-w-2xl">
                <SelectValue>{languageLabels[language]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <Separator />

        <p className="text-muted-foreground text-sm">
          前往{" "}
          <Link href="/app/analyze" className="text-foreground font-medium underline-offset-4 hover:underline">
            股票预测
          </Link>{" "}
          使用「分析配置」可临时调整单次运行参数；关联选股偏好后，弹窗会优先采用该偏好中的团队与模型标记。
        </p>
      </CardContent>
    </Card>
  );
}
