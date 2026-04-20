"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  PLAN_DAILY_LIMITS,
  type BillingCycle,
  type PlanId,
  resolveDailyAnalysisLimit,
  resolveDailyPickerLimit,
} from "@/lib/subscription-limits";

export { GUEST_QUOTA } from "@/lib/subscription-limits";
export type { BillingCycle, PlanId } from "@/lib/subscription-limits";

export type PlanDef = {
  id: PlanId;
  name: string;
  tagline: string;
  priceLabel: string;
  /** 月付收据与模拟支付展示（不含「/月」）。 */
  settlementAmountLabel: string;
  /** 年付收据与模拟支付展示。 */
  annualSettlementAmountLabel?: string;
  priceNote?: string;
  annualPriceLabel?: string;
  annualEquivMonthlyLabel?: string;
  features: string[];
  dailyAnalysisLimit: number;
  pickerSessionDaily: number;
};

export type SubscriptionOrder = {
  id: string;
  placedAt: string;
  planName: string;
  amountLabel: string;
  status: "paid" | "failed" | "cancelled" | "pending";
};

const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "免费版",
    tagline: "登录后启用完整免费配额与研究存档",
    priceLabel: "¥0",
    settlementAmountLabel: "¥0",
    features: [
      "每日股票预测 5 次（自然日重置）",
      "每日选股会话 5 次",
      "建议历史写入与个人列表（登录态）",
      "Markdown 导出与打印存档（与功能页一致）",
    ],
    dailyAnalysisLimit: PLAN_DAILY_LIMITS.free.dailyAnalysis,
    pickerSessionDaily: PLAN_DAILY_LIMITS.free.dailyPickerSessions,
  },
  {
    id: "pro",
    name: "专业版",
    tagline: "更高日配额，适合持续跟踪与复盘",
    priceLabel: "¥49/月",
    settlementAmountLabel: "¥49",
    annualSettlementAmountLabel: "¥468",
    annualPriceLabel: "¥468/年",
    annualEquivMonthlyLabel: "约合 ¥39/月",
    priceNote:
      "月付为连续包月；年付按年续费。演示支付可按所选周期模拟；正式环境以支付渠道与订单为准。",
    features: [
      "每日股票预测 80 次（自然日重置）",
      "每日选股会话 30 次",
      "包含免费版全部能力",
      "用量与到期规则以支付回调与后台对账为最终依据",
    ],
    dailyAnalysisLimit: PLAN_DAILY_LIMITS.pro.dailyAnalysis,
    pickerSessionDaily: PLAN_DAILY_LIMITS.pro.dailyPickerSessions,
  },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

type SubscriptionState = {
  plans: PlanDef[];
  currentPlanId: PlanId;
  /** 当前专业版订阅的计费周期（免费版时保留上次选择或默认月付）。 */
  billingCycle: BillingCycle;
  periodEnd: string | null;
  autoRenew: boolean;
  orders: SubscriptionOrder[];
  analysisCountByDay: Record<string, number>;
  pickerSessionsByDay: Record<string, number>;
  paymentStatus: "idle" | "pending" | "success" | "failed" | "cancelled";
  setPaymentStatus: (s: SubscriptionState["paymentStatus"]) => void;
  simulateSubscribeSuccess: (cycle: BillingCycle) => void;
  appendOrder: (o: SubscriptionOrder) => void;
  resetToFree: () => void;
  tryConsumeAnalysis: (isGuest: boolean) => boolean;
  tryConsumePickerSession: (isGuest: boolean) => boolean;
  getDailyAnalysisRemaining: (isGuest: boolean) => number;
  getPickerSessionsRemaining: (isGuest: boolean) => number;
  getPlan: (id: PlanId) => PlanDef;
};

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      plans: PLANS,
      currentPlanId: "free",
      billingCycle: "month",
      periodEnd: null,
      autoRenew: false,
      orders: [],
      analysisCountByDay: {},
      pickerSessionsByDay: {},
      paymentStatus: "idle",
      setPaymentStatus: (paymentStatus) => set({ paymentStatus }),
      simulateSubscribeSuccess: (cycle) => {
        const pro = PLANS.find((p) => p.id === "pro")!;
        const end = new Date();
        if (cycle === "month") {
          end.setMonth(end.getMonth() + 1);
        } else {
          end.setFullYear(end.getFullYear() + 1);
        }
        const amountLabel =
          cycle === "month" ? pro.settlementAmountLabel : (pro.annualSettlementAmountLabel ?? "¥468");
        const order: SubscriptionOrder = {
          id: `ord-${Date.now()}`,
          placedAt: new Date().toISOString(),
          planName: pro.name,
          amountLabel,
          status: "paid",
        };
        set((s) => ({
          currentPlanId: "pro",
          billingCycle: cycle,
          periodEnd: end.toISOString().slice(0, 10),
          autoRenew: true,
          paymentStatus: "success",
          orders: [order, ...s.orders].slice(0, 20),
        }));
      },
      appendOrder: (o) =>
        set((s) => ({
          orders: [o, ...s.orders].slice(0, 20),
        })),
      resetToFree: () =>
        set({
          currentPlanId: "free",
          billingCycle: "month",
          periodEnd: null,
          autoRenew: false,
          paymentStatus: "idle",
        }),
      getPlan: (id) => PLANS.find((p) => p.id === id) ?? PLANS[0],
      getDailyAnalysisRemaining: (isGuest) => {
        const { currentPlanId, analysisCountByDay } = get();
        const key = todayKey();
        const used = analysisCountByDay[key] ?? 0;
        const limit = resolveDailyAnalysisLimit(isGuest, currentPlanId);
        return Math.max(0, limit - used);
      },
      tryConsumeAnalysis: (isGuest) => {
        const remaining = get().getDailyAnalysisRemaining(isGuest);
        if (remaining <= 0) return false;
        const key = todayKey();
        set((s) => ({
          analysisCountByDay: {
            ...s.analysisCountByDay,
            [key]: (s.analysisCountByDay[key] ?? 0) + 1,
          },
        }));
        return true;
      },
      tryConsumePickerSession: (isGuest) => {
        const key = todayKey();
        const { pickerSessionsByDay, currentPlanId } = get();
        const used = pickerSessionsByDay[key] ?? 0;
        const limit = resolveDailyPickerLimit(isGuest, currentPlanId);
        if (used >= limit) return false;
        set((s) => ({
          pickerSessionsByDay: {
            ...s.pickerSessionsByDay,
            [key]: used + 1,
          },
        }));
        return true;
      },
      getPickerSessionsRemaining: (isGuest) => {
        const key = todayKey();
        const { pickerSessionsByDay, currentPlanId } = get();
        const used = pickerSessionsByDay[key] ?? 0;
        const limit = resolveDailyPickerLimit(isGuest, currentPlanId);
        return Math.max(0, limit - used);
      },
    }),
    {
      name: "zhputian-subscription",
      partialize: (s) => ({
        currentPlanId: s.currentPlanId,
        billingCycle: s.billingCycle,
        periodEnd: s.periodEnd,
        autoRenew: s.autoRenew,
        orders: s.orders,
        analysisCountByDay: s.analysisCountByDay,
        pickerSessionsByDay: s.pickerSessionsByDay,
      }),
    },
  ),
);
