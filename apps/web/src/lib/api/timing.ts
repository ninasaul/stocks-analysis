import type { AnalysisInput, TimingReport } from "@/lib/contracts/domain";
import { timingReportSchema } from "@/lib/contracts/domain";
import { getPublicApiBaseUrl, isMockFlowEnabled } from "@/lib/env";
import { buildSyntheticTimingReport } from "@/lib/synthetic/timing-report";
import { useAuthStore } from "@/stores/use-auth-store";

function hashSymbolKey(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type ApiAnalyzeResponse = {
  stock_info?: {
    name?: string;
    code?: string;
    exchange?: string;
    market?: string;
  };
  final_signal?: "BUY" | "SELL" | "HOLD";
  final_score?: number;
  ratings?: {
    overall?: number;
    technical?: number;
    fundamental?: number;
  };
  technical_analysis?: {
    signal?: "BUY" | "SELL" | "HOLD";
    confidence?: number;
    market_report?: string;
    indicators?: Record<string, unknown> | null;
    price_range?: {
      current_price?: number;
      buy_range?: {
        best_buy_price?: number;
        secondary_buy_price?: number;
        stop_loss?: number;
        take_profit?: number;
      };
      sell_range?: {
        best_sell_price?: number;
        secondary_sell_price?: number;
        stop_loss?: number;
        take_profit?: number;
      };
    };
  };
  fundamental_analysis?: {
    thesis?: string;
    risks?: string[] | string;
    catalyst?: string;
    fundamentals_report?: string;
  };
  strategy_position?: {
    best_buy_price?: number | null;
    secondary_buy_price?: number | null;
    best_sell_price?: number | null;
    secondary_sell_price?: number | null;
    stop_loss?: number | null;
    take_profit?: number | null;
  };
  execution_plan?: {
    focus_price_range?: string;
    risk_price?: string;
    monitor_target_price?: string;
    risk_exposure?: string;
    invalid_trigger?: string;
  };
  debate_result?: {
    bull_case?: string;
    bear_case?: string;
  };
  reflection?: {
    lessons_learned?: string;
    improvements?: string[] | string;
  };
  basis_and_risks?: {
    investment_thesis?: string;
    key_risks?: string[] | string;
    catalyst?: string;
  };
  created_at?: string;
  error?: string;
};

type ApiAnalyzeCreateResponse = {
  task_id?: string;
  record_id?: string;
  message?: string;
};

type ApiAnalyzeTaskStatusResponse = {
  task_id?: string;
  record_id?: string | null;
  status?: string;
  progress?: number;
  progress_message?: string;
  result?: ApiAnalyzeResponse | null;
  error?: string | null;
};

export type AnalyzeProgress = {
  progress: number;
  message: string;
};

type ApiHistoryResponse = {
  analysis_result?: ApiAnalyzeResponse[];
  error?: string;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPrice(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "--";
  return n.toFixed(2);
}

function normalizeSignal(value: unknown): "BUY" | "SELL" | "HOLD" {
  if (value === "BUY" || value === "SELL" || value === "HOLD") return value;
  return "HOLD";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n|[;；]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseApiCreatedAt(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return Date.now();
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function inferMarket(input: AnalysisInput | null, payload: ApiAnalyzeResponse): AnalysisInput["market"] {
  if (input?.market) return input.market;
  const rawMarket = String(payload.stock_info?.market ?? "").toUpperCase();
  if (rawMarket.includes("港")) return "HK";
  if (rawMarket.includes("美")) return "US";
  return "CN";
}

function toFiveState(signal: "BUY" | "SELL" | "HOLD"): TimingReport["action"] {
  if (signal === "BUY") return "add";
  if (signal === "SELL") return "reduce";
  return "wait";
}

function toRiskLevel(total: number): TimingReport["risk_level"] {
  if (total >= 75) return "low";
  if (total >= 45) return "medium";
  return "high";
}

function extractNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function buildPlanMetrics(referencePrice: number, targetPrice: number) {
  if (!(referencePrice > 0) || !Number.isFinite(targetPrice)) return undefined;
  return {
    reference_price: referencePrice,
    target_price: targetPrice,
    expected_return_pct: ((targetPrice - referencePrice) / referencePrice) * 100,
  };
}

type AnalyzeQueryConfig = {
  depth: 1 | 2 | 3;
  market_analyst: boolean;
  fundamental_analyst: boolean;
  news_analyst: boolean;
  social_analyst: boolean;
  sentiment_analysis: boolean;
  risk_assessment: boolean;
};

function parseBoolFeature(themes: string[], key: string, fallback: boolean): boolean {
  const hasAnyFeatureTag = themes.some((theme) => theme.startsWith("feature:"));
  if (!hasAnyFeatureTag) return fallback;
  return themes.includes(`feature:${key}`);
}

function buildAnalyzeQueryConfig(input: AnalysisInput): AnalyzeQueryConfig {
  const themes = input.preference_snapshot?.themes ?? [];
  const hasAnalystTags = themes.some((theme) => theme.startsWith("analyst:"));
  const market_analyst = hasAnalystTags ? themes.includes("analyst:market") : true;
  const fundamental_analyst = hasAnalystTags ? themes.includes("analyst:fundamental") : true;
  const news_analyst = hasAnalystTags ? themes.includes("analyst:news") : false;
  const social_analyst = hasAnalystTags ? themes.includes("analyst:social") : false;
  const sentiment_analysis = parseBoolFeature(themes, "sentiment", true);
  const risk_assessment = parseBoolFeature(themes, "risk_assessment", true);

  // 后端当前仅支持 1~3；前端配置 4~5 统一映射到后端 3（全面分析）。
  let depth: 1 | 2 | 3 = 3;
  if (input.holding_horizon === "intraday_to_days" && input.risk_tier === "conservative") depth = 1;
  else if (input.holding_horizon === "w1_to_w4") depth = 2;

  return {
    depth,
    market_analyst,
    fundamental_analyst,
    news_analyst,
    social_analyst,
    sentiment_analysis,
    risk_assessment,
  };
}

function mapAnalyzeToTimingReport(input: AnalysisInput | null, payload: ApiAnalyzeResponse): TimingReport {
  const signal = normalizeSignal(payload.final_signal ?? payload.technical_analysis?.signal);
  const total = clampNumber(Math.round(extractNumber(payload.final_score, payload.ratings?.overall ?? 50)), 0, 100);
  const technical = clampNumber(
    Math.round(extractNumber(payload.ratings?.technical, (total / 100) * 60)),
    0,
    60,
  );
  const structureRisk = clampNumber(Math.round((total / 100) * 25), 0, 25);
  const eventDiscount = clampNumber(100 - total - technical - structureRisk, 0, 15);
  const confidence = clampNumber(Math.round(extractNumber(payload.technical_analysis?.confidence, 70)), 0, 100);

  const currentPrice = extractNumber(payload.technical_analysis?.price_range?.current_price, 0);
  const bestBuy = extractNumber(payload.strategy_position?.best_buy_price, currentPrice * 0.99);
  const secondaryBuy = extractNumber(payload.strategy_position?.secondary_buy_price, currentPrice * 0.97);
  const bestSell = extractNumber(payload.strategy_position?.best_sell_price, currentPrice * 1.01);
  const secondarySell = extractNumber(payload.strategy_position?.secondary_sell_price, currentPrice * 1.03);
  const stopLoss = extractNumber(payload.strategy_position?.stop_loss, currentPrice * 0.95);
  const takeProfit = extractNumber(payload.strategy_position?.take_profit, currentPrice * 1.08);
  const focusLow = Math.min(bestBuy || stopLoss, secondaryBuy || bestBuy || stopLoss);
  const focusHigh = Math.max(bestSell || takeProfit, secondarySell || bestSell || takeProfit);
  const riskPrice = stopLoss;
  const targetPrice = takeProfit;
  const referenceForMetrics = currentPrice > 0 ? currentPrice : (focusLow + focusHigh) / 2;
  const plan_metrics = buildPlanMetrics(referenceForMetrics, targetPrice);
  const market = inferMarket(input, payload);
  const symbol = String(input?.symbol ?? payload.stock_info?.code ?? "").toUpperCase();
  const executionPlan = payload.execution_plan ?? {};
  const fundamental = payload.fundamental_analysis ?? {};
  const basis = payload.basis_and_risks ?? {};
  const bullish = normalizeStringArray(payload.debate_result?.bull_case);
  const bearish = [
    ...normalizeStringArray(payload.debate_result?.bear_case),
    ...normalizeStringArray(fundamental.risks),
  ];
  const conflicts = normalizeStringArray(basis.key_risks);
  const reminders = [
    ...normalizeStringArray(payload.reflection?.lessons_learned),
    ...normalizeStringArray(payload.reflection?.improvements),
  ];

  const rawSi = payload.stock_info;
  const stock_info = rawSi
    ? {
        name: typeof rawSi.name === "string" ? rawSi.name.trim() : undefined,
        code: typeof rawSi.code === "string" ? rawSi.code.trim().toUpperCase() : undefined,
        exchange: typeof rawSi.exchange === "string" ? rawSi.exchange.trim() : undefined,
        market: typeof rawSi.market === "string" ? rawSi.market.trim() : undefined,
      }
    : undefined;

  return timingReportSchema.parse({
    id: `api-${market}.${symbol}-${parseApiCreatedAt(payload.created_at)}`,
    symbol,
    market,
    timeframe: input?.timeframe ?? "daily",
    risk_tier: input?.risk_tier ?? "balanced",
    holding_horizon: input?.holding_horizon ?? "m1_to_m3",
    action: toFiveState(signal),
    action_reason:
      signal === "BUY"
        ? "后端综合分析偏多，当前策略以分批布局为主，仍需严格遵守风险位。"
        : signal === "SELL"
          ? "后端综合分析偏空，当前策略以控制风险和减仓为主，等待结构重新确认。"
          : "后端综合分析为中性，当前以观望和等待关键信号确认为主。",
    confidence,
    risk_level: toRiskLevel(total),
    score_breakdown: {
      technical,
      structure_risk: structureRisk,
      event_discount: eventDiscount,
      total,
    },
    gate_downgraded: signal === "HOLD",
    gate_reason: signal === "HOLD" ? "信号未形成明确方向，系统按中性策略处理。" : null,
    plan: {
      focus_range: executionPlan.focus_price_range || `${formatPrice(focusLow)} - ${formatPrice(focusHigh)}`,
      risk_level_price: executionPlan.risk_price || `${formatPrice(riskPrice)}`,
      target_price: executionPlan.monitor_target_price || `${formatPrice(targetPrice)}`,
      risk_exposure_pct: executionPlan.risk_exposure || "建议风险敞口约 5%～12%",
      invalidation: executionPlan.invalid_trigger || "若价格偏离关注区间并连续失守关键风险位，应停止沿用当前结论。",
      valid_until: "T+5 交易日内复核",
    },
    evidence_positive:
      bullish.length > 0
        ? bullish
        : normalizeStringArray(fundamental.thesis).length > 0
          ? normalizeStringArray(fundamental.thesis)
          : ["技术与结构指标未出现明显冲突，趋势仍可跟踪。"],
    evidence_negative:
      bearish.length > 0 ? bearish : ["存在短线波动放大风险，需要更严格执行仓位控制。"],
    evidence_conflicts: conflicts.length > 0 ? conflicts : undefined,
    reminders:
      reminders.length > 0
        ? reminders
        : ["仅供研究参考，不构成投资建议。", "本产品不提供下单、委托或任何交易执行能力。"],
    data_version: "api-v1",
    created_at: parseApiCreatedAt(payload.created_at),
    plan_metrics,
    stock_info,
  });
}

async function syntheticTimingReportWithDelay(input: AnalysisInput): Promise<TimingReport> {
  const delayMs = 600 + (hashSymbolKey(input.symbol) % 800);
  await new Promise((r) => setTimeout(r, delayMs));
  return buildSyntheticTimingReport(input);
}

const ANALYZE_POLL_INTERVAL_MS = 5000;
const ANALYZE_POLL_TIMEOUT_MS = 25 * 60 * 1000;

async function pollAnalyzeResult(
  taskId: string,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  onProgress?: (progress: AnalyzeProgress) => void,
): Promise<ApiAnalyzeResponse> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < ANALYZE_POLL_TIMEOUT_MS) {
    const statusUrl = new URL(`/api/analyze/${encodeURIComponent(taskId)}`, getPublicApiBaseUrl());
    const statusResponse = await fetcher(statusUrl.toString(), { method: "GET" });
    if (!statusResponse.ok) {
      if (statusResponse.status === 429) {
        throw new Error("quota");
      }
      throw new Error(`查询分析任务失败（${statusResponse.status}）`);
    }

    const statusPayload = (await statusResponse.json()) as ApiAnalyzeTaskStatusResponse;
    const status = String(statusPayload.status ?? "").toUpperCase();
    const hasResult = statusPayload.result !== null && statusPayload.result !== undefined;
    const hasErrorText =
      typeof statusPayload.error === "string" && statusPayload.error.trim().length > 0;
    onProgress?.({
      progress: clampNumber(Math.round(extractNumber(statusPayload.progress, 0)), 0, 100),
      message: String(statusPayload.progress_message ?? "").trim() || "正在分析中...",
    });
    // 后端当前状态为 pending/processing/completed/failed；
    // 同时兼容历史或潜在状态命名变更，只要携带 result 也视为完成。
    if (status === "COMPLETED" || status === "SUCCESS" || status === "DONE" || hasResult) {
      const result = statusPayload.result;
      if (!result) {
        throw new Error("分析任务已完成，但未返回结果");
      }
      if (typeof result.error === "string" && result.error.trim().length > 0) {
        throw new Error(result.error);
      }
      return result;
    }

    if (status === "FAILED" || status === "ERROR" || status === "CANCELLED" || hasErrorText) {
      const errorMessage =
        typeof statusPayload.error === "string" && statusPayload.error.trim().length > 0
          ? statusPayload.error
          : "分析任务执行失败";
      throw new Error(errorMessage);
    }

    await new Promise((resolve) => setTimeout(resolve, ANALYZE_POLL_INTERVAL_MS));
  }

  throw new Error("分析任务超时，请稍后重试");
}

export async function requestTimingReport(
  input: AnalysisInput,
  options?: {
    onProgress?: (progress: AnalyzeProgress) => void;
  },
): Promise<TimingReport> {
  const state = useAuthStore.getState();
  const canCallLiveAnalyze = state.session === "user" && Boolean(state.accessToken);
  // 与额度 mock 一致：mock 流程下择时报告仍走本地合成数据，暂不调用后端 /api/analyze。
  if (!canCallLiveAnalyze || isMockFlowEnabled()) {
    return syntheticTimingReportWithDelay(input);
  }

  const queryConfig = buildAnalyzeQueryConfig(input);
  const createUrl = new URL("/api/analyze", getPublicApiBaseUrl());
  options?.onProgress?.({ progress: 0, message: "正在创建分析任务..." });
  const createResponse = await state.authenticatedFetch(createUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: input.symbol,
      depth: queryConfig.depth,
      market_analyst: queryConfig.market_analyst,
      fundamental_analyst: queryConfig.fundamental_analyst,
      news_analyst: queryConfig.news_analyst,
      social_analyst: queryConfig.social_analyst,
      sentiment_analysis: queryConfig.sentiment_analysis,
      risk_assessment: queryConfig.risk_assessment,
    }),
  });
  if (!createResponse.ok) {
    if (createResponse.status === 429) {
      throw new Error("quota");
    }
    try {
      const payload = (await createResponse.json()) as { detail?: string; message?: string; error?: string };
      const detail = payload.detail ?? payload.message ?? payload.error;
      if (typeof detail === "string" && detail.trim().length > 0) {
        throw new Error(detail);
      }
    } catch {
      // Ignore parse errors and fall back to status code message.
    }
    throw new Error(`请求失败（${createResponse.status}）`);
  }

  const createPayload = (await createResponse.json()) as ApiAnalyzeCreateResponse;
  const taskId = String(createPayload.task_id ?? "").trim();
  if (!taskId) {
    throw new Error("创建分析任务失败：缺少 task_id");
  }

  options?.onProgress?.({ progress: 5, message: "任务创建成功，开始轮询进度..." });
  const payload = await pollAnalyzeResult(taskId, state.authenticatedFetch, options?.onProgress);
  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    throw new Error(payload.error);
  }
  return mapAnalyzeToTimingReport(input, payload);
}

export async function requestAnalyzeHistory(): Promise<TimingReport[]> {
  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) return [];

  const url = new URL("/api/analyze/history", getPublicApiBaseUrl());
  const response = await state.authenticatedFetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`获取历史记录失败（${response.status}）`);
  }

  const payload = (await response.json()) as ApiHistoryResponse;
  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    throw new Error(payload.error);
  }

  const items = Array.isArray(payload.analysis_result) ? payload.analysis_result : [];
  return items
    .map((item) => {
      try {
        return mapAnalyzeToTimingReport(null, item);
      } catch {
        return null;
      }
    })
    .filter((item): item is TimingReport => item !== null);
}

export async function requestReportFile(
  ticker: string,
  format: "markdown" | "pdf",
): Promise<{ blob: Blob; contentType: string }> {
  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) {
    throw new Error("当前未登录，请先登录后重试");
  }

  const url = new URL("/api/analyze/report", getPublicApiBaseUrl());
  url.searchParams.set("ticker", ticker);
  url.searchParams.set("format", format);

  const response = await state.authenticatedFetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`获取报告失败（${response.status}）`);
  }
  return {
    blob: await response.blob(),
    contentType: response.headers.get("content-type") ?? "",
  };
}
