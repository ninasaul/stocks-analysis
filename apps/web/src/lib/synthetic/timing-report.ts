import type { AnalysisInput, TimingReport } from "@/lib/contracts/domain";
import { timingReportSchema } from "@/lib/contracts/domain";

export function hashSymbolKey(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function riskTierFactor(tier: AnalysisInput["risk_tier"]) {
  if (tier === "conservative") return 0.85;
  if (tier === "balanced") return 1;
  return 1.12;
}

/** Deterministic synthetic report for UI and export parity (no live market feed). */
export function buildSyntheticTimingReport(input: AnalysisInput): TimingReport {
  const h = hashSymbolKey(`${input.market}.${input.symbol}`);
  const rf = riskTierFactor(input.risk_tier);
  const gate = h % 5 === 0;
  const actions = ["wait", "trial", "add", "reduce", "exit"] as const;
  const action = actions[h % 5];
  const baseScore = Math.round((35 + (h % 55)) * rf);
  const technical = Math.min(60, Math.round(baseScore * 0.58));
  const structure = Math.min(25, Math.round(baseScore * 0.28));
  const event = Math.min(15, Math.max(0, baseScore - technical - structure));
  const total = Math.min(100, technical + structure + event);
  const finalAction = gate && (action === "add" || action === "trial") ? "wait" : action;

  const anchor = 80 + (h % 120);
  const band = 4 + (h % 8);
  const low = anchor - band;
  const high = anchor + band;
  const riskPx = (low - 2 - (h % 3)).toFixed(1);
  const tgtLoNum = high + 2;
  const tgtHiNum = high + 10 + (h % 6);
  const tgtLo = tgtLoNum.toFixed(1);
  const tgtHi = tgtHiNum.toFixed(1);
  const refMid = (low + high) / 2;
  const targetMid = (tgtLoNum + tgtHiNum) / 2;
  const plan_metrics =
    refMid > 0
      ? {
          reference_price: refMid,
          target_price: targetMid,
          expected_return_pct: ((targetMid - refMid) / refMid) * 100,
        }
      : undefined;

  return timingReportSchema.parse({
    id: `r-${Date.now()}-${h % 1000}`,
    symbol: input.symbol.toUpperCase(),
    market: input.market,
    timeframe: input.timeframe,
    risk_tier: input.risk_tier,
    holding_horizon: input.holding_horizon,
    action: finalAction,
    action_reason: gate
      ? "风险闸门触发：关键假设未满足，建议先观望并等待价格与波动收敛。"
      : "综合技术结构、波动与事件折扣后的主结论；结论随行情与披露更新，请在有效期内复核。",
    confidence: Math.min(95, 42 + (h % 45)),
    risk_level: h % 3 === 0 ? "high" : h % 3 === 1 ? "medium" : "low",
    score_breakdown: {
      technical,
      structure_risk: structure,
      event_discount: event,
      total,
    },
    gate_downgraded: gate,
    gate_reason: gate
      ? "财报或重大事件窗口内波动抬升，或关键价位假设尚未经价格确认；结论已按规则保守处理。"
      : null,
    plan: {
      focus_range: `参考近期箱体与均线带：关注区间约 ${low.toFixed(1)}～${high.toFixed(1)}（合成推演，非实时行情）`,
      risk_level_price: `若收盘有效跌破 ${riskPx}，且随后 3 个交易日内未能收回，则本次计划条件失效`,
      target_price: `阶段观察目标位约 ${tgtLo}～${tgtHi}（与风险位同源回溯，用于评估潜在波动空间）`,
      risk_exposure_pct:
        input.risk_tier === "conservative"
          ? "建议风险敞口约 3%～8%"
          : input.risk_tier === "balanced"
            ? "建议风险敞口约 5%～12%"
            : "建议风险敞口约 8%～15%（进取档上限更高，仍须服从个人风险承受）",
      invalidation:
        "风险位被有效跌破、波动率异常抬升，或重大信息导致原假设不再成立时，应停止按原结论执行跟踪。",
      valid_until: "T+5 交易日内有效（自本报告生成时起算，具体以交易日历为准）",
    },
    evidence_positive: [
      "中短期均线结构尚未破坏，趋势跟踪仍具备技术基础。",
      "量价配合阶段性改善，动能未出现持续性衰竭信号。",
      "波动率处于相对可控区间，未进入极端扩张状态。",
    ],
    evidence_negative: [
      "事件窗口内历史波动偏高，价格对信息冲击更敏感。",
      "部分动量指标与价格走势存在轻微背离，需等待方向确认。",
    ],
    evidence_conflicts: ["趋势类信号与事件折扣方向存在分歧，结论已按闸门规则收敛。"],
    reminders: [
      "仅供研究参考，不构成投资建议。",
      "本产品不提供下单、委托或任何交易执行能力。",
    ],
    data_version: "synthetic-v1",
    created_at: Date.now(),
    plan_metrics,
  });
}
