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

type ApiTimingResponse = {
  composite?: number;
  signal?: "BUY" | "SELL" | "HOLD";
  price_range?: {
    current_price?: number;
    buy_range?: { low?: number; high?: number };
    sell_range?: { low?: number; high?: number };
  };
  [key: string]: unknown;
};

type ApiDebateResponse = {
  final_score?: number;
  signal?: "BUY" | "SELL" | "HOLD";
  bull?: { arguments?: string[] };
  bear?: { rebuttals?: string[]; risks?: string[] };
};

type ApiAnalyzeResponse = {
  ticker?: string;
  signal?: "BUY" | "SELL" | "HOLD";
  score?: number;
  timing?: ApiTimingResponse;
  debate?: ApiDebateResponse;
  error?: string;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPrice(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "--";
  return n.toFixed(2);
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

function mapAnalyzeToTimingReport(input: AnalysisInput, payload: ApiAnalyzeResponse): TimingReport {
  const timing = payload.timing ?? {};
  const debate = payload.debate ?? {};
  const timingComposite = clampNumber(extractNumber(timing.composite, 0), -1, 1);
  const debateScore = clampNumber(extractNumber(debate.final_score, timingComposite), -1, 1);
  const signal = payload.signal ?? debate.signal ?? timing.signal ?? "HOLD";

  const technical = clampNumber(Math.round(((timingComposite + 1) / 2) * 60), 0, 60);
  const structureRisk = clampNumber(Math.round(((debateScore + 1) / 2) * 25), 0, 25);
  const eventDiscount = clampNumber(Math.round(Math.abs(timingComposite - debateScore) * 15), 0, 15);
  const total = clampNumber(technical + structureRisk + eventDiscount, 0, 100);
  const confidence = clampNumber(Math.round(55 + Math.abs(debateScore) * 35), 0, 100);

  const currentPrice = extractNumber(timing.price_range?.current_price, 0);
  const buyLow = extractNumber(timing.price_range?.buy_range?.low, currentPrice ? currentPrice * 0.98 : 0);
  const buyHigh = extractNumber(timing.price_range?.buy_range?.high, currentPrice ? currentPrice * 1.01 : 0);
  const sellLow = extractNumber(timing.price_range?.sell_range?.low, currentPrice ? currentPrice * 0.99 : 0);
  const sellHigh = extractNumber(timing.price_range?.sell_range?.high, currentPrice ? currentPrice * 1.03 : 0);
  const focusLow = signal === "SELL" ? sellLow : buyLow;
  const focusHigh = signal === "SELL" ? sellHigh : buyHigh;
  const riskPrice = signal === "SELL" ? sellHigh : buyLow;
  const targetPrice = signal === "SELL" ? sellLow : sellHigh;
  const referenceForMetrics = currentPrice > 0 ? currentPrice : (focusLow + focusHigh) / 2;
  const plan_metrics = buildPlanMetrics(referenceForMetrics, targetPrice);

  const bullArguments = Array.isArray(debate.bull?.arguments) ? debate.bull.arguments : [];
  const bearRebuttals = Array.isArray(debate.bear?.rebuttals) ? debate.bear.rebuttals : [];
  const bearRisks = Array.isArray(debate.bear?.risks) ? debate.bear.risks : [];

  return timingReportSchema.parse({
    id: `api-${input.market}.${input.symbol}-${Date.now()}`,
    symbol: input.symbol.toUpperCase(),
    market: input.market,
    timeframe: input.timeframe,
    risk_tier: input.risk_tier,
    holding_horizon: input.holding_horizon,
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
    gate_reason: signal === "HOLD" ? "信号未形成明确方向，系统按中性策略处理。": null,
    plan: {
      focus_range: `${formatPrice(focusLow)} - ${formatPrice(focusHigh)}`,
      risk_level_price: `${formatPrice(riskPrice)}`,
      target_price: `${formatPrice(targetPrice)}`,
      risk_exposure_pct:
        input.risk_tier === "conservative"
          ? "建议风险敞口约 3%～8%"
          : input.risk_tier === "balanced"
            ? "建议风险敞口约 5%～12%"
            : "建议风险敞口约 8%～15%",
      invalidation: "若价格偏离关注区间并连续失守关键风险位，应停止沿用当前结论。",
      valid_until: "T+5 交易日内复核",
    },
    evidence_positive:
      bullArguments.length > 0 ? bullArguments : ["技术与结构指标未出现明显冲突，趋势仍可跟踪。"],
    evidence_negative:
      bearRebuttals.length > 0 ? bearRebuttals : ["存在短线波动放大风险，需要更严格执行仓位控制。"],
    evidence_conflicts: bearRisks.length > 0 ? bearRisks : undefined,
    reminders: ["仅供研究参考，不构成投资建议。", "本产品不提供下单、委托或任何交易执行能力。"],
    data_version: "api-v1",
    created_at: Date.now(),
    plan_metrics,
  });
}

async function syntheticTimingReportWithDelay(input: AnalysisInput): Promise<TimingReport> {
  const delayMs = 600 + (hashSymbolKey(input.symbol) % 800);
  await new Promise((r) => setTimeout(r, delayMs));
  return buildSyntheticTimingReport(input);
}

export async function requestTimingReport(input: AnalysisInput): Promise<TimingReport> {
  const state = useAuthStore.getState();
  const canCallLiveAnalyze = state.session === "user" && Boolean(state.accessToken);
  // 与额度 mock 一致：mock 流程下择时报告仍走本地合成数据，暂不调用后端 /api/analyze。
  if (!canCallLiveAnalyze || isMockFlowEnabled()) {
    return syntheticTimingReportWithDelay(input);
  }

  const url = new URL("/api/analyze", getPublicApiBaseUrl());
  url.searchParams.set("ticker", input.symbol);
  url.searchParams.set("mode", "full");

  const response = await state.authenticatedFetch(url.toString(), {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`请求失败（${response.status}）`);
  }
  const payload = (await response.json()) as ApiAnalyzeResponse;
  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    throw new Error(payload.error);
  }
  return mapAnalyzeToTimingReport(input, payload);
}
