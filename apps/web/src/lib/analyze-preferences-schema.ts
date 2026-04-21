/** 与「分析配置」弹窗共享的偏好字段（不含标的、分析日期等单次运行项）。 */

export const ANALYZE_MODEL_OPTIONS = [
  "Qwen3.5-Flash",
  "Qwen3.5-Plus",
  "Qwen3.5-Max",
  "Qwen3.5-Coder",
] as const;

export type AnalyzeModelOption = (typeof ANALYZE_MODEL_OPTIONS)[number];

export type AnalyzePreferenceDepth = 1 | 2 | 3 | 4 | 5;

export type AnalyzePreferenceAnalystRole = "market" | "fundamental" | "news" | "social";

export type AnalyzePreferenceLanguage = "zh" | "en";

export type AnalyzePreferencesState = {
  depth: AnalyzePreferenceDepth;
  analystRoles: AnalyzePreferenceAnalystRole[];
  quickModel: AnalyzeModelOption;
  deepModel: AnalyzeModelOption;
  sentiment: boolean;
  riskAssessment: boolean;
  language: AnalyzePreferenceLanguage;
};

export const DEFAULT_ANALYZE_PREFERENCES: AnalyzePreferencesState = {
  depth: 3,
  analystRoles: ["market", "fundamental"],
  quickModel: ANALYZE_MODEL_OPTIONS[0],
  deepModel: ANALYZE_MODEL_OPTIONS[1],
  sentiment: true,
  riskAssessment: true,
  language: "zh",
};

export const ANALYZE_DEPTH_SUMMARY: Record<
  AnalyzePreferenceDepth,
  { title: string; hint: string }
> = {
  1: { title: "一级 · 快速分析", hint: "约 2～5 分钟" },
  2: { title: "二级 · 基础分析", hint: "约 3～6 分钟" },
  3: { title: "三级 · 标准分析", hint: "约 4～8 分钟，推荐默认" },
  4: { title: "四级 · 深度分析", hint: "约 6～11 分钟" },
  5: { title: "五级 · 全面分析", hint: "约 8～16 分钟" },
};

const ANALYST_ORDER: AnalyzePreferenceAnalystRole[] = ["market", "fundamental", "news", "social"];

function isAnalyzeModelOption(v: string): v is AnalyzeModelOption {
  return (ANALYZE_MODEL_OPTIONS as readonly string[]).includes(v);
}

function isDepth(v: number): v is AnalyzePreferenceDepth {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

export function coerceAnalyzeModel(value: string, fallback: AnalyzeModelOption): AnalyzeModelOption {
  return isAnalyzeModelOption(value) ? value : fallback;
}

export function normalizeAnalystRoles(roles: unknown): AnalyzePreferenceAnalystRole[] {
  if (!Array.isArray(roles)) return [...DEFAULT_ANALYZE_PREFERENCES.analystRoles];
  const next = new Set<AnalyzePreferenceAnalystRole>();
  for (const r of roles) {
    if (r === "market" || r === "fundamental" || r === "news" || r === "social") next.add(r);
  }
  if (next.size === 0) {
    return [...DEFAULT_ANALYZE_PREFERENCES.analystRoles];
  }
  return ANALYST_ORDER.filter((id) => next.has(id));
}

export function normalizeAnalyzePreferences(partial: unknown): AnalyzePreferencesState {
  const base = DEFAULT_ANALYZE_PREFERENCES;
  if (!partial || typeof partial !== "object") return { ...base };

  const o = partial as Record<string, unknown>;
  const rawDepth = o.depth;
  const depth =
    typeof rawDepth === "number" && isDepth(rawDepth) ? rawDepth : base.depth;

  const analystRoles = normalizeAnalystRoles(o.analystRoles);

  const quickModel = coerceAnalyzeModel(
    typeof o.quickModel === "string" ? o.quickModel : "",
    base.quickModel,
  );
  const deepModel = coerceAnalyzeModel(
    typeof o.deepModel === "string" ? o.deepModel : "",
    base.deepModel,
  );

  const sentiment = typeof o.sentiment === "boolean" ? o.sentiment : base.sentiment;
  const riskAssessment =
    typeof o.riskAssessment === "boolean" ? o.riskAssessment : base.riskAssessment;

  const lang = o.language === "en" ? "en" : o.language === "zh" ? "zh" : base.language;

  return {
    depth,
    analystRoles,
    quickModel,
    deepModel,
    sentiment,
    riskAssessment,
    language: lang,
  };
}
