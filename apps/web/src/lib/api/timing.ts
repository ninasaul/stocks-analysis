import type { AnalysisInput, TimingReport } from "@/lib/contracts/domain";
import { buildSyntheticTimingReport } from "@/lib/synthetic/timing-report";

function hashSymbolKey(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Replace with HTTP call to timing orchestration when backend is available. */
export async function requestTimingReport(input: AnalysisInput): Promise<TimingReport> {
  const delayMs = 600 + (hashSymbolKey(input.symbol) % 800);
  await new Promise((r) => setTimeout(r, delayMs));
  return buildSyntheticTimingReport(input);
}
