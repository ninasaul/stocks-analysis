import type { FiveState } from "./types";

export const actionLabels: Record<FiveState, string> = {
  wait: "观望",
  trial: "试仓",
  add: "加仓",
  reduce: "减仓",
  exit: "离场",
};

export const riskLabels: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

export const timeframeLabels: Record<string, string> = {
  daily: "日线",
  weekly: "周线",
};
