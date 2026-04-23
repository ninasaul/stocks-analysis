import type { Market } from "../../utils/types";
import { formatBoardSymbol } from "../../utils/universe";
import { addWatchlistRaw, entryKey, loadWatchlist, removeWatchlistEntry, type WatchlistEntry } from "../../utils/watchlist";
import { buildSampleBaseQuote } from "../../utils/sample-quote";

Page({
  data: {
    query: "",
    entries: [] as WatchlistEntry[],
    errMsg: "",
    lines: [] as { k: string; title: string; sub: string; tone: string }[],
  },

  onShow() {
    this.refreshList();
  },

  onPullDownRefresh() {
    this.refreshList();
    wx.stopPullDownRefresh();
  },

  onGoAnalyze() {
    wx.switchTab({ url: "/pages/analyze/analyze" });
  },

  refreshList() {
    const entries = loadWatchlist();
    const lines = entries.map((e) => {
      const q = buildSampleBaseQuote(e.market, e.symbol);
      const tone = q.changePct > 0 ? "up" : q.changePct < 0 ? "down" : "flat";
      const sub = `${q.price.toFixed(2)} · ${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`;
      return {
        k: entryKey(e),
        title: `${formatBoardSymbol(e.market, e.symbol)} ${e.name}`,
        sub,
        tone,
      };
    });
    this.setData({ entries, lines });
  },

  onQueryInput(e: WechatMiniprogram.Input) {
    this.setData({ query: e.detail.value });
  },

  onAdd() {
    const q = (this.data.query as string).trim();
    const r = addWatchlistRaw(q, "CN");
    if (!r.ok) {
      this.setData({ errMsg: r.reason || "添加失败" });
      return;
    }
    this.setData({ errMsg: "", query: "" });
    this.refreshList();
    wx.showToast({ title: "已加入自选", icon: "success" });
  },

  onRemove(e: WechatMiniprogram.TouchEvent) {
    const k = (e.currentTarget.dataset as { k?: string }).k;
    if (!k) return;
    removeWatchlistEntry(k);
    this.refreshList();
    wx.showToast({ title: "已移除", icon: "none" });
  },

  onOpenAnalyze(e: WechatMiniprogram.TouchEvent) {
    const k = (e.currentTarget.dataset as { k?: string }).k;
    if (!k) return;
    const [m, sym] = k.split(".") as [Market, string];
    const ent = this.data.entries.find((x) => entryKey(x) === k);
    getApp<IAppOption>().globalData.analyzePrefill = {
      market: m,
      symbol: sym,
      name: ent?.name || sym,
    };
    wx.switchTab({ url: "/pages/analyze/analyze" });
  },
});
