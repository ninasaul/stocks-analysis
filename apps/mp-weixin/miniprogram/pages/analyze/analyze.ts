import { fetchTimingReport } from "../../utils/analyze-api";
import { reportCardModForAction } from "../../utils/five-state-ui";
import { prependArchive } from "../../utils/archive";
import { hasSession, promptNavigateToLogin } from "../../utils/guard";
import { actionLabels, riskLabels } from "../../utils/labels";
import { buildSampleBaseQuote } from "../../utils/sample-quote";
import type { AnalysisInput, TimingReport } from "../../utils/types";
import { ANALYZE_SYMBOL_SAMPLE_UNIVERSE, formatBoardSymbol, resolveUniverseEntry } from "../../utils/universe";

type AnalyzeHit = {
  key: string;
  market: "CN" | "HK" | "US";
  symbol: string;
  name: string;
};

function fuzzyScore(query: string, key: string, name: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const k = key.toLowerCase();
  const sym = key.split(".")[1]?.toLowerCase() ?? "";
  const n = name.toLowerCase();
  let score = 0;
  if (k === q) score += 140;
  if (sym === q) score += 130;
  if (n === q) score += 120;
  if (sym.startsWith(q)) score += 100;
  else if (sym.includes(q)) score += 76;
  if (n.startsWith(q)) score += 88;
  else if (n.includes(q)) score += 68;
  if (k.startsWith(q)) score += 80;
  else if (k.includes(q)) score += 60;
  return score;
}

function nowHm(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function confidencePct(confidence: number): number {
  const n = Number(confidence);
  if (!Number.isFinite(n)) return 0;
  const normalized = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

Page({
  data: {
    keyword: "CN.600519",
    loading: false,
    errMsg: "",
    report: null as TimingReport | null,
    actionLabel: "",
    riskLabel: "",
    quoteLine: "",
    searchHits: [] as AnalyzeHit[],
    guest: true,
    reportCardMod: "",
    selectedLine: "",
    matchStatus: "请输入标的代码",
    runEnabled: false,
    confidencePct: 0,
    analysisTime: "--:--",
  },

  onPullDownRefresh() {
    this.setData({ guest: !hasSession(), errMsg: "" });
    this.refreshSearchHits();
    this.syncInputMeta();
    wx.stopPullDownRefresh();
  },

  onShow() {
    this.setData({ guest: !hasSession() });
    const app = getApp<IAppOption>();
    const pre = app.globalData.analyzePrefill;
    if (pre) {
      app.globalData.analyzePrefill = null;
      this.setData({ keyword: `${pre.market}.${pre.symbol}` }, () => {
        this.refreshSearchHits();
        this.syncInputMeta();
      });
      return;
    }
    this.refreshSearchHits();
    this.syncInputMeta();
  },

  refreshSearchHits() {
    const q = (this.data.keyword as string).trim();
    const list = ANALYZE_SYMBOL_SAMPLE_UNIVERSE.map((u) => ({
      item: u,
      score: fuzzyScore(q, u.key, u.name),
    }))
      .filter((x) => x.score > 0 || !q)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => ({
        key: x.item.key,
        market: x.item.market,
        symbol: x.item.symbol,
        name: x.item.name,
      }));
    this.setData({ searchHits: q ? list : list.slice(0, 8) });
  },

  syncInputMeta() {
    const raw = (this.data.keyword as string).trim();
    const entry = resolveUniverseEntry(raw, "CN");
    const selectedLine = entry ? `${formatBoardSymbol(entry.market, entry.symbol)} · ${entry.name}` : "";
    const normalized = raw.toUpperCase();
    const exactMatch = !!entry && (normalized === entry.key || normalized === entry.symbol.toUpperCase());
    const matchStatus = !raw ? "请输入标的代码" : exactMatch ? "已匹配可预测" : "可预测（按输入解析）";
    this.setData({ selectedLine, matchStatus, runEnabled: Boolean(entry && raw) });
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value }, () => {
      this.refreshSearchHits();
      this.syncInputMeta();
    });
  },

  onPickHit(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset as { key?: string }).key;
    if (!key) return;
    this.setData({ keyword: key }, () => {
      this.refreshSearchHits();
      this.syncInputMeta();
    });
  },

  onClearKeyword() {
    this.setData({ keyword: "", report: null, errMsg: "" }, () => {
      this.refreshSearchHits();
      this.syncInputMeta();
    });
  },

  async onRunAnalyze() {
    if (!hasSession()) {
      promptNavigateToLogin({
        title: "需要登录",
        content: "运行预测前请先完成微信登录。",
      });
      return;
    }
    if (this.data.loading) return;
    const raw = (this.data.keyword as string).trim();
    const entry = resolveUniverseEntry(raw, "CN");
    if (!entry) {
      this.setData({ errMsg: "请输入有效代码或从候选标的中选择。" });
      return;
    }
    const input: AnalysisInput = {
      symbol: entry.symbol,
      market: entry.market,
      timeframe: "daily",
      risk_tier: "balanced",
      holding_horizon: "m1_to_m3",
    };
    this.setData({ keyword: `${entry.market}.${entry.symbol}` });
    this.setData({ loading: true, errMsg: "", reportCardMod: "" });
    try {
      const report = await fetchTimingReport(input);
      const archive = {
        ...report,
        title: `${report.market}.${report.symbol} 择时快照`,
      };
      prependArchive(archive);
      const q = buildSampleBaseQuote(report.market, report.symbol);
      const quoteLine = `最新 ${q.price.toFixed(2)} · 涨跌 ${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%（样本行情）`;
      const confPct = confidencePct(report.confidence);
      this.setData({
        loading: false,
        guest: false,
        report,
        reportCardMod: reportCardModForAction(report.action),
        actionLabel: actionLabels[report.action],
        riskLabel: riskLabels[report.risk_level],
        quoteLine,
        confidencePct: confPct,
        analysisTime: nowHm(),
      });
      this.syncInputMeta();
      wx.showToast({ title: "预测完成", icon: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "预测失败";
      this.setData({ loading: false, errMsg: msg, report: null, reportCardMod: "" });
    }
  },
});
