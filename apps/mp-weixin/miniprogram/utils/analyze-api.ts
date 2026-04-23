import type { AnalysisInput, TimingReport } from "./types";
import { httpRequest } from "./http";
import { getAccessToken } from "./session";
import { mapAnalyzeToTimingReport, type ApiAnalyzeResponse } from "./timing-map";

export async function fetchTimingReport(input: AnalysisInput): Promise<TimingReport> {
  if (!getAccessToken()) {
    throw new Error("请先登录后再运行预测");
  }
  const path = `/api/analyze?ticker=${encodeURIComponent(input.symbol)}&mode=full`;
  const payload = await httpRequest<ApiAnalyzeResponse>({ path, method: "GET", auth: true });
  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    throw new Error(payload.error);
  }
  return mapAnalyzeToTimingReport(input, payload);
}
