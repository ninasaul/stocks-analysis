"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlanId = "free" | "pro";

export type PlanDef = {
  id: PlanId;
  name: string;
  priceLabel: string;
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
    name: "免费档",
    priceLabel: "¥0",
    features: [
      "游客每日股票预测 1 次",
      "登录后建议存档与历史列表",
      "选股对话按日配额（与订阅档位一致）",
    ],
    dailyAnalysisLimit: 1,
    pickerSessionDaily: 2,
  },
  {
    id: "pro",
    name: "专业档",
    priceLabel: "¥68/月",
    features: [
      "每日股票预测更高上限（以套餐配置为准）",
      "Markdown 导出与打印生成 PDF",
      "选股对话更高日配额与优先体验",
    ],
    dailyAnalysisLimit: 999,
    pickerSessionDaily: 50,
  },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

type SubscriptionState = {
  plans: PlanDef[];
  currentPlanId: PlanId;
  periodEnd: string | null;
  autoRenew: boolean;
  orders: SubscriptionOrder[];
  analysisCountByDay: Record<string, number>;
  pickerSessionsByDay: Record<string, number>;
  paymentStatus: "idle" | "pending" | "success" | "failed" | "cancelled";
  setPaymentStatus: (s: SubscriptionState["paymentStatus"]) => void;
  simulateSubscribeSuccess: () => void;
  appendOrder: (o: SubscriptionOrder) => void;
  resetToFree: () => void;
  /** Returns false if blocked */
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
      periodEnd: null,
      autoRenew: false,
      orders: [],
      analysisCountByDay: {},
      pickerSessionsByDay: {},
      paymentStatus: "idle",
      setPaymentStatus: (paymentStatus) => set({ paymentStatus }),
      simulateSubscribeSuccess: () => {
        const end = new Date();
        end.setMonth(end.getMonth() + 1);
        const order: SubscriptionOrder = {
          id: `ord-${Date.now()}`,
          placedAt: new Date().toISOString(),
          planName: "专业档",
          amountLabel: "¥68",
          status: "paid",
        };
        set((s) => ({
          currentPlanId: "pro",
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
        set({ currentPlanId: "free", periodEnd: null, autoRenew: false, paymentStatus: "idle" }),
      getPlan: (id) => PLANS.find((p) => p.id === id) ?? PLANS[0],
      getDailyAnalysisRemaining: (isGuest) => {
        const { currentPlanId, analysisCountByDay } = get();
        const key = todayKey();
        const used = analysisCountByDay[key] ?? 0;
        const limit = isGuest
          ? 1
          : currentPlanId === "pro"
            ? 999
            : 5;
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
        const limit = isGuest ? 2 : currentPlanId === "pro" ? 50 : 5;
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
        const limit = isGuest ? 2 : currentPlanId === "pro" ? 50 : 5;
        return Math.max(0, limit - used);
      },
    }),
    {
      name: "zhputian-subscription",
      partialize: (s) => ({
        currentPlanId: s.currentPlanId,
        periodEnd: s.periodEnd,
        autoRenew: s.autoRenew,
        orders: s.orders,
        analysisCountByDay: s.analysisCountByDay,
        pickerSessionsByDay: s.pickerSessionsByDay,
      }),
    },
  ),
);
