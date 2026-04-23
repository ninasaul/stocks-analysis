/**
 * 订阅日配额与游客额度（单一事实源）。
 * `use-subscription-store`、营销页、订阅页及 `/api/subscription/limits` 应与此一致。
 */
export type PlanId = "free" | "pro";

export type BillingCycle = "month" | "quarter" | "year";

export const GUEST_QUOTA = {
  dailyStockAnalysis: 1,
  dailyPickerSessions: 2,
} as const;

export const PLAN_DAILY_LIMITS = {
  free: { dailyAnalysis: 5, dailyPickerSessions: 5 },
  pro: { dailyAnalysis: 80, dailyPickerSessions: 30 },
} as const;

export function resolveDailyAnalysisLimit(isGuest: boolean, planId: PlanId): number {
  if (isGuest) return GUEST_QUOTA.dailyStockAnalysis;
  return PLAN_DAILY_LIMITS[planId].dailyAnalysis;
}

export function resolveDailyPickerLimit(isGuest: boolean, planId: PlanId): number {
  if (isGuest) return GUEST_QUOTA.dailyPickerSessions;
  return PLAN_DAILY_LIMITS[planId].dailyPickerSessions;
}
