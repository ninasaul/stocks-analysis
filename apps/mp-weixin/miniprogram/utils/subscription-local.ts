const KEY = "zhputian-subscription";

export type PlanId = "free" | "pro";

type SubPersist = {
  state?: {
    currentPlanId?: PlanId;
    billingCycle?: string;
    periodEnd?: string | null;
    autoRenew?: boolean;
  };
};

export type SubscriptionDisplay = {
  planId: PlanId;
  planName: string;
  isPro: boolean;
  periodEnd: string;
  periodLine: string;
  autoRenew: boolean;
  autoRenewLine: string;
  billingCycle: string;
};

export function loadSubscriptionDisplay(): SubscriptionDisplay {
  const defaults: SubscriptionDisplay = {
    planId: "free",
    planName: "免费版",
    isPro: false,
    periodEnd: "",
    periodLine: "未开通付费套餐",
    autoRenew: false,
    autoRenewLine: "未开启",
    billingCycle: "",
  };
  try {
    const raw = wx.getStorageSync(KEY);
    if (!raw || typeof raw !== "string") return defaults;
    const parsed = JSON.parse(raw) as SubPersist;
    const st = parsed.state;
    if (!st) return defaults;
    const planId: PlanId = st.currentPlanId === "pro" ? "pro" : "free";
    const planName = planId === "pro" ? "专业版" : "免费版";
    const periodEnd = typeof st.periodEnd === "string" ? st.periodEnd : "";
    const autoRenew = Boolean(st.autoRenew);
    const billingCycle = typeof st.billingCycle === "string" ? st.billingCycle : "";

    let periodLine = "未开通付费套餐";
    if (planId === "pro") {
      periodLine = periodEnd ? `有效期至 ${periodEnd}` : "已开通专业版";
    }

    return {
      planId,
      planName,
      isPro: planId === "pro",
      periodEnd,
      periodLine,
      autoRenew,
      autoRenewLine: autoRenew ? "已开启" : "未开启",
      billingCycle,
    };
  } catch {
    return defaults;
  }
}
