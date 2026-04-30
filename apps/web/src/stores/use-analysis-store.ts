"use client";

import { create } from "zustand";
import type { AnalysisInput, Market, PreferenceSnapshot, TimingReport } from "@/lib/contracts/domain";
import { archiveEntrySchema, timingReportSchema } from "@/lib/contracts/domain";
import { requestTimingReport, type AnalyzeProgress } from "@/lib/api/timing";
import { useArchiveStore } from "@/stores/use-archive-store";
import { useAuthStore } from "@/stores/use-auth-store";

type PendingHandoff = {
  symbol: string;
  market: Market;
  preference_snapshot: PreferenceSnapshot;
} | null;

type AnalysisState = {
  pendingHandoff: PendingHandoff;
  setPendingHandoff: (h: PendingHandoff) => void;
  currentInput: AnalysisInput | null;
  report: TimingReport | null;
  loading: boolean;
  progress: AnalyzeProgress | null;
  error: string | null;
  generateReport: (input: AnalysisInput) => Promise<boolean>;
  buildMarkdown: () => string;
  clearReport: () => void;
};

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  pendingHandoff: null,
  setPendingHandoff: (pendingHandoff) => set({ pendingHandoff }),
  currentInput: null,
  report: null,
  loading: false,
  progress: null,
  error: null,
  clearReport: () => set({ report: null, error: null, currentInput: null, progress: null }),
  generateReport: async (input) => {
    const isGuest = useAuthStore.getState().session === "guest";
    set({ loading: true, progress: null, error: null, currentInput: input });
    try {
      const report = await requestTimingReport(input, {
        onProgress: (progress) => set({ progress }),
      });
      timingReportSchema.parse(report);
      set({ report, loading: false, progress: null, error: null });
      const entry = archiveEntrySchema.parse({
        ...report,
        title: `${report.market}.${report.symbol} 择时快照`,
      });
      useArchiveStore.getState().tryAddArchive(entry, isGuest);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "quota") {
        set({ loading: false, progress: null, error: "quota" });
        return false;
      }
      set({ loading: false, progress: null, error: "unknown" });
      return false;
    }
  },
  buildMarkdown: () => {
    const r = get().report;
    if (!r) return "";
    const actionMap: Record<string, string> = {
      wait: "观望",
      trial: "试仓",
      add: "加仓",
      reduce: "减仓",
      exit: "离场",
    };
    return [
      `# 择时报告 ${r.market}.${r.symbol}`,
      ``,
      `## 结论`,
      `- 五态：**${actionMap[r.action] ?? r.action}**`,
      `- 置信度：${r.confidence}`,
      `- 风险等级：${r.risk_level}`,
      `- 闸门降级：${r.gate_downgraded ? "是" : "否"}${r.gate_reason ? ` — ${r.gate_reason}` : ""}`,
      ``,
      `## 评分分解（60/25/15）`,
      `- 技术：${r.score_breakdown.technical}`,
      `- 结构与风险：${r.score_breakdown.structure_risk}`,
      `- 事件折扣：${r.score_breakdown.event_discount}`,
      `- 综合：${r.score_breakdown.total}`,
      ``,
      `## 研究计划`,
      `- 关注区间：${r.plan.focus_range}`,
      `- 风险位：${r.plan.risk_level_price}`,
      `- 观察目标位：${r.plan.target_price}`,
      `- 风险敞口：${r.plan.risk_exposure_pct}`,
      `- 失效条件：${r.plan.invalidation}`,
      `- 有效期：${r.plan.valid_until}`,
      ``,
      `## 依据`,
      r.evidence_positive.map((x) => `- ${x}`).join("\n"),
      ``,
      `### 负向与冲突`,
      ...r.evidence_negative.map((x) => `- ${x}`),
      ...(r.evidence_conflicts ?? []).map((x) => `- 冲突：${x}`),
      ``,
      `## 提醒`,
      ...r.reminders.map((x) => `- ${x}`),
      ``,
      `_data_version: ${r.data_version}_`,
    ].join("\n");
  },
}));
