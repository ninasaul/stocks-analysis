import { loadArchives } from "../../utils/archive";
import { badgeClassForAction } from "../../utils/five-state-ui";
import { actionLabels } from "../../utils/labels";

Page({
  data: {
    list: [] as {
      id: string;
      title: string;
      sub: string;
      actionLabel: string;
      badgeClass: string;
    }[],
  },

  loadList() {
    const archives = loadArchives();
    const list = archives.map((a) => ({
      id: a.id,
      title: a.title,
      sub: `${a.market}.${a.symbol} · ${new Date(a.created_at).toLocaleString()}`,
      actionLabel: actionLabels[a.action],
      badgeClass: badgeClassForAction(a.action),
    }));
    this.setData({ list });
  },

  onShow() {
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList();
    wx.stopPullDownRefresh();
  },

  onGoAnalyze() {
    wx.switchTab({ url: "/pages/analyze/analyze" });
  },

  onOpenDetail(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id?: string }).id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/history-detail/history-detail?id=${encodeURIComponent(id)}` });
  },
});
