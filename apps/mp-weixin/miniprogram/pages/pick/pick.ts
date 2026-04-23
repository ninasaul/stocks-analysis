import type { CapLiquidity, HoldingHorizon, Market, PreferenceSnapshot, RiskTier, StylePref } from "../../utils/types";
import {
  applyPickerAction,
  createInitialPickerState,
  loadPickerState,
  savePickerState,
  sendConsultUserText,
  type PickerState,
  type SuggestedAction,
} from "../../utils/picker-reducer";

type CandidateView = { code: string; name: string; reason: string };
type ActionView = { action_id: string; label: string; kind: "clarify" | "primary" | "secondary" };

const MARKET_LABEL: Record<Market, string> = {
  CN: "A 股",
  HK: "港股",
  US: "美股",
};

const HORIZON_LABEL: Record<HoldingHorizon, string> = {
  intraday_to_days: "日内至数日",
  w1_to_w4: "1～4 周",
  m1_to_m3: "1～3 个月",
  m3_plus: "3 个月以上",
};

const STYLE_LABEL: Record<StylePref, string> = {
  value: "价值",
  growth: "成长",
  momentum: "动量/趋势",
  no_preference: "无偏好",
};

const RISK_LABEL: Record<RiskTier, string> = {
  conservative: "保守",
  balanced: "平衡",
  aggressive: "进取",
};

const CAP_LABEL: Record<CapLiquidity, string> = {
  unrestricted: "不限制",
  large_mid_liquid: "大中盘",
  small_volatile_ok: "小盘高波动",
};

function resolvePhaseTitle(s: PickerState): string {
  if (s.conversation_phase === "candidates_shown") return "候选已生成";
  if (s.conversation_phase === "ready_to_screen") return "可生成候选";
  if (s.script === "start" || s.script === "consult_reply") return "对话启动";
  return "偏好采集中";
}

function resolvePhaseHint(s: PickerState): string {
  if (s.conversation_phase === "candidates_shown") return "可点击候选进入股票预测查看详情。";
  if (s.conversation_phase === "ready_to_screen") return "偏好已齐套，建议直接生成候选标的。";
  if (s.script === "start" || s.script === "consult_reply") return "先咨询策略，或一键进入结构化选股。";
  return "完成关键偏好设置后，候选会更贴合你的风险与风格。";
}

function resolveSector(pref: PreferenceSnapshot): string {
  if (pref.sector_mode === "unrestricted") return "行业不限";
  if (!pref.sectors.length) return "待选择";
  return pref.sectors.join(" / ");
}

function resolveThemes(pref: PreferenceSnapshot): string {
  if (!pref.themes.length) return "无";
  return pref.themes.join(" / ");
}

function resolveExclusions(pref: PreferenceSnapshot): string {
  if (!pref.exclusions.length) return "无";
  const map: Record<string, string> = {
    exclude_st: "ST",
    exclude_illiquid: "低流动性",
    exclude_high_leverage: "高杠杆",
  };
  return pref.exclusions.map((x) => map[x] || x).join(" / ");
}

function classifyActions(actions: SuggestedAction[]): { primary: ActionView[]; secondary: ActionView[] } {
  const primary = actions.filter((a) => a.kind === "primary");
  const secondary = actions.filter((a) => a.kind !== "primary");
  return { primary, secondary };
}

Page({
  data: {
    state: createInitialPickerState(),
    draft: "",
    scrollInto: "",
    candidates: [] as CandidateView[],
    primaryActions: [] as ActionView[],
    secondaryActions: [] as ActionView[],
    phaseTitle: "对话启动",
    phaseHint: "先咨询策略，或一键进入结构化选股。",
    progressPct: 0,
    progressText: "0/8",
    prefMarket: "A 股",
    prefSector: "行业不限",
    prefHorizon: "1～3 个月",
    prefStyle: "无偏好",
    prefRisk: "保守",
    prefCap: "大中盘",
    prefThemes: "无",
    prefExclusions: "无",
  },

  onShow() {
    this.reloadFromStorage();
  },

  onPullDownRefresh() {
    this.reloadFromStorage();
    wx.stopPullDownRefresh();
    wx.showToast({ title: "已重新载入", icon: "none" });
  },

  reloadFromStorage() {
    const loaded = loadPickerState();
    if (loaded) {
      this.setData({ state: loaded });
    } else {
      this.setData({ state: createInitialPickerState() });
    }
    this.syncDerived();
  },

  onHide() {
    const st = this.data.state as PickerState;
    if (st) savePickerState(st);
  },

  syncDerived() {
    const st = this.data.state as PickerState | null;
    if (!st) return;
    const pref = st.preference_snapshot;
    const progress = Math.max(0, Math.min(8, st.confirmedPreferenceSlots || 0));
    const { primary, secondary } = classifyActions(st.suggested_actions || []);
    this.setData({
      candidates: st.candidate_stocks || [],
      primaryActions: primary,
      secondaryActions: secondary,
      phaseTitle: resolvePhaseTitle(st),
      phaseHint: resolvePhaseHint(st),
      progressPct: Math.round((progress / 8) * 100),
      progressText: `${progress}/8`,
      prefMarket: MARKET_LABEL[pref.market],
      prefSector: resolveSector(pref),
      prefHorizon: HORIZON_LABEL[pref.holding_horizon],
      prefStyle: STYLE_LABEL[pref.style],
      prefRisk: RISK_LABEL[pref.risk_tier],
      prefCap: CAP_LABEL[pref.cap_liquidity],
      prefThemes: resolveThemes(pref),
      prefExclusions: resolveExclusions(pref),
    });
  },

  persist(s: PickerState) {
    savePickerState(s);
    const last = s.messages.length ? s.messages[s.messages.length - 1].id : "";
    this.setData({ state: s, scrollInto: last });
    this.syncDerived();
    if (last) {
      setTimeout(() => {
        this.setData({ scrollInto: "" });
      }, 280);
    }
  },

  onActionTap(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id?: string }).id;
    if (!id || !this.data.state) return;
    const next = applyPickerAction(this.data.state as PickerState, id);
    this.persist(next);
  },

  onDraftInput(e: WechatMiniprogram.Input) {
    this.setData({ draft: e.detail.value });
  },

  onSendDraft() {
    const st = this.data.state as PickerState | null;
    if (!st) return;
    const text = (this.data.draft as string).trim();
    if (!text) {
      wx.showToast({ title: "请输入内容", icon: "none" });
      return;
    }
    const next = sendConsultUserText(st, text);
    this.setData({ draft: "" });
    this.persist(next);
  },

  async onReset() {
    if ((this.data.state as PickerState).messages.length > 1) {
      const { confirm } = await wx.showModal({
        title: "重新开始",
        content: "将清空本轮对话与当前候选，是否继续？",
        confirmText: "继续",
        cancelText: "取消",
      });
      if (!confirm) return;
    }
    const next = createInitialPickerState();
    this.persist(next);
  },

  onOpenAnalyze(e: WechatMiniprogram.TouchEvent) {
    const code = (e.currentTarget.dataset as { code?: string; m?: Market }).code;
    const m = (e.currentTarget.dataset as { code?: string; m?: Market }).m;
    const name = (e.currentTarget.dataset as { name?: string }).name || code || "";
    if (!code || !m) return;
    getApp<IAppOption>().globalData.analyzePrefill = { market: m, symbol: code, name };
    wx.switchTab({ url: "/pages/analyze/analyze" });
  },
});
