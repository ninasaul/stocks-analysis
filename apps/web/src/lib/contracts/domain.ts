import { z } from "zod";

export const marketSchema = z.enum(["CN", "HK", "US"]);
export type Market = z.infer<typeof marketSchema>;

export const sectorModeSchema = z.enum(["unrestricted", "specified"]);
export const holdingHorizonSchema = z.enum([
  "intraday_to_days",
  "w1_to_w4",
  "m1_to_m3",
  "m3_plus",
]);
export const styleSchema = z.enum([
  "value",
  "growth",
  "momentum",
  "no_preference",
]);
export const riskTierSchema = z.enum(["conservative", "balanced", "aggressive"]);
export const capLiquiditySchema = z.enum([
  "unrestricted",
  "large_mid_liquid",
  "small_volatile_ok",
]);

export const preferenceSnapshotSchema = z.object({
  market: marketSchema,
  sector_mode: sectorModeSchema,
  sectors: z.array(z.string()),
  themes: z.array(z.string()),
  holding_horizon: holdingHorizonSchema,
  style: styleSchema,
  risk_tier: riskTierSchema,
  cap_liquidity: capLiquiditySchema,
  exclusions: z.array(z.string()),
  other_notes: z.string().nullable(),
});
export type PreferenceSnapshot = z.infer<typeof preferenceSnapshotSchema>;

export const conversationPhaseSchema = z.enum([
  "clarifying",
  "ready_to_screen",
  "candidates_shown",
]);
export type ConversationPhase = z.infer<typeof conversationPhaseSchema>;

export const fiveStateSchema = z.enum([
  "wait",
  "trial",
  "add",
  "reduce",
  "exit",
]);
export type FiveState = z.infer<typeof fiveStateSchema>;

export const suggestedActionSchema = z.object({
  action_id: z.string(),
  label: z.string(),
  kind: z.enum(["clarify", "primary", "secondary"]).default("clarify"),
  exclusive_group: z.string().optional(),
});
export type SuggestedAction = z.infer<typeof suggestedActionSchema>;

export const scoreBreakdownSchema = z.object({
  technical: z.number(),
  structure_risk: z.number(),
  event_discount: z.number(),
  total: z.number(),
});
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;

export const timingPlanSchema = z.object({
  focus_range: z.string(),
  risk_level_price: z.string(),
  target_price: z.string(),
  risk_exposure_pct: z.string(),
  invalidation: z.string(),
  valid_until: z.string(),
});
export type TimingPlan = z.infer<typeof timingPlanSchema>;

/** 与后端分析结果 `stock_info` 对齐；历史记录可能缺失部分字段。 */
export const stockInfoSchema = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
  exchange: z.string().optional(),
  market: z.string().optional(),
});
export type StockInfo = z.infer<typeof stockInfoSchema>;

/** Numeric snapshot for history / recap; optional for older persisted archives. */
export const planMetricsSchema = z.object({
  reference_price: z.number(),
  target_price: z.number(),
  /** Signed percent: (target - reference) / reference * 100. */
  expected_return_pct: z.number(),
});
export type PlanMetrics = z.infer<typeof planMetricsSchema>;

export const timingReportSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  market: marketSchema,
  timeframe: z.enum(["daily", "weekly"]),
  risk_tier: riskTierSchema,
  holding_horizon: holdingHorizonSchema,
  action: fiveStateSchema,
  action_reason: z.string(),
  confidence: z.number().min(0).max(100),
  risk_level: z.enum(["low", "medium", "high"]),
  score_breakdown: scoreBreakdownSchema,
  gate_downgraded: z.boolean(),
  gate_reason: z.string().nullable(),
  plan: timingPlanSchema,
  evidence_positive: z.array(z.string()),
  evidence_negative: z.array(z.string()),
  evidence_conflicts: z.array(z.string()).optional(),
  reminders: z.array(z.string()),
  data_version: z.string(),
  created_at: z.number(),
  plan_metrics: planMetricsSchema.optional(),
  stock_info: stockInfoSchema.optional(),
});
export type TimingReport = z.infer<typeof timingReportSchema>;

export const archiveEntrySchema = timingReportSchema.extend({
  title: z.string(),
});
export type ArchiveEntry = z.infer<typeof archiveEntrySchema>;

export const candidateStockSchema = z.object({
  code: z.string(),
  name: z.string(),
  reason: z.string(),
  snapshot_keys: z.array(z.string()),
});
export type CandidateStock = z.infer<typeof candidateStockSchema>;

export const analysisInputSchema = z.object({
  symbol: z.string().min(1),
  market: marketSchema,
  timeframe: z.enum(["daily", "weekly"]),
  risk_tier: riskTierSchema,
  holding_horizon: holdingHorizonSchema,
  preference_snapshot: preferenceSnapshotSchema.optional(),
});
export type AnalysisInput = z.infer<typeof analysisInputSchema>;
