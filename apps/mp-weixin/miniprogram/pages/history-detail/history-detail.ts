import { getArchiveById } from "../../utils/archive";
import { badgeClassForAction, reportCardModForAction } from "../../utils/five-state-ui";
import { actionLabels, riskLabels, timeframeLabels } from "../../utils/labels";
import type { ArchiveEntry } from "../../utils/types";

Page({
  data: {
    entry: null as unknown as ArchiveEntry | null,
    actionLabel: "",
    riskLabel: "",
    timeframeLabel: "",
    badgeClass: "",
    reportCardMod: "",
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query.id ? decodeURIComponent(query.id) : "";
    const entry = id ? getArchiveById(id) : undefined;
    if (!entry) {
      this.setData({ entry: null });
      return;
    }
    this.setData({
      entry,
      actionLabel: actionLabels[entry.action],
      riskLabel: riskLabels[entry.risk_level],
      timeframeLabel: timeframeLabels[entry.timeframe] || entry.timeframe,
      badgeClass: badgeClassForAction(entry.action),
      reportCardMod: reportCardModForAction(entry.action),
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onGoAnalyze() {
    wx.switchTab({ url: "/pages/analyze/analyze" });
  },

  onGoHistory() {
    wx.navigateTo({ url: "/pages/history/history" });
  },

  onReAnalyze() {
    const entry = this.data.entry as ArchiveEntry | null;
    if (!entry) return;
    getApp<IAppOption>().globalData.analyzePrefill = {
      market: entry.market,
      symbol: entry.symbol,
      name: entry.title || `${entry.market}.${entry.symbol}`,
    };
    wx.switchTab({ url: "/pages/analyze/analyze" });
  },
});
