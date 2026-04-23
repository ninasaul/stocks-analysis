/**
 * 选股对话状态机（与 Web `use-picker-store` 主流程对齐，纯函数、无 zustand）。
 */
import type { CandidateStock, Market, PreferenceSnapshot } from "./types";

export type PickerMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export type SuggestedAction = {
  action_id: string;
  label: string;
  kind: "clarify" | "primary" | "secondary";
};

export type ConversationPhase = "clarifying" | "ready_to_screen" | "candidates_shown";

export type PickerScript =
  | "start"
  | "consult_reply"
  | "pick_d1"
  | "pick_d2"
  | "pick_d2_sectors"
  | "pick_d4"
  | "pick_d5"
  | "pick_d6"
  | "pick_d7"
  | "pick_d8"
  | "pick_d3"
  | "ready"
  | "candidates";

export type PickerState = {
  sessionId: string;
  script: PickerScript;
  messages: PickerMessage[];
  preference_snapshot: PreferenceSnapshot;
  conversation_phase: ConversationPhase;
  candidate_stocks: CandidateStock[];
  suggested_actions: SuggestedAction[];
  confirmedPreferenceSlots: number;
  quotaBlocked: boolean;
};

const SECTOR_OPTIONS: { action_id: string; label: string; value: string }[] = [
  { action_id: "toggle_sector_信息技术", label: "信息技术", value: "信息技术" },
  { action_id: "toggle_sector_金融", label: "金融", value: "金融" },
  { action_id: "toggle_sector_医疗保健", label: "医疗保健", value: "医疗保健" },
  { action_id: "toggle_sector_必需消费", label: "必需消费", value: "必需消费" },
  { action_id: "toggle_sector_工业", label: "工业", value: "工业" },
  { action_id: "toggle_sector_能源", label: "能源", value: "能源" },
];

const defaultSnapshot: PreferenceSnapshot = {
  market: "CN",
  sector_mode: "unrestricted",
  sectors: [],
  themes: [],
  holding_horizon: "m1_to_m3",
  style: "no_preference",
  risk_tier: "conservative",
  cap_liquidity: "large_mid_liquid",
  exclusions: [],
  other_notes: null,
};

const startActions: SuggestedAction[] = [
  { action_id: "intent_consult", label: "策略咨询", kind: "secondary" },
  { action_id: "intent_pick", label: "帮我选股", kind: "primary" },
];

const starterAssistantMessage =
  "你好，我是选股对话助手。你可以先进行「策略咨询」，或直接选择「帮我选股」进入 D1-D8 结构化流程。";

function nid(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pushUser(s: PickerState, text: string): PickerState {
  return {
    ...s,
    messages: [...s.messages, { id: nid(), role: "user", content: text, createdAt: Date.now() }],
  };
}

function pushAssistant(
  s: PickerState,
  content: string,
  actions: SuggestedAction[],
  phase: ConversationPhase,
  extra?: Partial<PickerState>
): PickerState {
  return {
    ...s,
    ...extra,
    messages: [...s.messages, { id: nid(), role: "assistant", content, createdAt: Date.now() }],
    suggested_actions: actions,
    conversation_phase: phase,
  };
}

const horizonLabel: Record<PreferenceSnapshot["holding_horizon"], string> = {
  intraday_to_days: "日内至数日",
  w1_to_w4: "1～4 周",
  m1_to_m3: "1～3 个月",
  m3_plus: "3 个月以上",
};
const styleLabel: Record<PreferenceSnapshot["style"], string> = {
  value: "价值",
  growth: "成长",
  momentum: "动量/趋势",
  no_preference: "无明确风格偏好",
};
const capLabel: Record<PreferenceSnapshot["cap_liquidity"], string> = {
  unrestricted: "不限制",
  large_mid_liquid: "偏大中盘与流动性",
  small_volatile_ok: "接受小盘高波动",
};

function snapSummary(pref: PreferenceSnapshot): string {
  const m = pref.market === "CN" ? "A 股" : pref.market === "HK" ? "港股" : "美股";
  const sectors =
    pref.sector_mode === "specified" && pref.sectors.length ? pref.sectors.join("、") : "行业不限制";
  const risk = pref.risk_tier === "conservative" ? "保守" : pref.risk_tier === "balanced" ? "平衡" : "进取";
  return `根据你已选：${m}；${sectors}；持有周期 ${horizonLabel[pref.holding_horizon]}；风格 ${styleLabel[pref.style]}；风险档 ${risk}；市值与流动性 ${capLabel[pref.cap_liquidity]}。`;
}

function sectorPickActions(): SuggestedAction[] {
  return [
    ...SECTOR_OPTIONS.map((o) => ({ action_id: o.action_id, label: o.label, kind: "clarify" as const })),
    { action_id: "d2_sectors_confirm", label: "确认行业选择", kind: "primary" },
    { action_id: "restart", label: "重新开始对话", kind: "secondary" },
  ];
}

function buildCandidates(snap: PreferenceSnapshot): CandidateStock[] {
  const m = snap.market;
  const keysD = (labels: string[]): string[] => labels;
  if (m === "CN") {
    return [
      {
        code: "600519",
        name: "贵州茅台",
        reason: `与已确认偏好一致：${snap.cap_liquidity === "large_mid_liquid" ? "大中盘与流动性" : "市值流动性设定"}、${snap.risk_tier === "conservative" ? "保守" : snap.risk_tier === "balanced" ? "平衡" : "进取"}风险档${
          snap.sector_mode === "specified" && snap.sectors.some((x) => x.includes("必需") || x.includes("消费"))
            ? "，并覆盖必选消费相关行业映射"
            : ""
        }。`,
        snapshot_keys: keysD(["D1 交易市场", "D6 风险承受", "D7 市值与流动性", "D2 行业"]),
      },
      {
        code: "601318",
        name: "中国平安",
        reason:
          snap.sector_mode === "specified" && snap.sectors.some((x) => x.includes("金融"))
            ? "与「指定行业」中的金融类一致，并满足流动性与风险档约束。"
            : "在「行业不限制」下，结合风险档与流动性偏好给出的金融板块代表性标的。",
        snapshot_keys: keysD(["D1 交易市场", "D2 行业范围", "D6 风险承受", "D7 市值与流动性"]),
      },
    ];
  }
  if (m === "HK") {
    return [
      {
        code: "00700",
        name: "腾讯控股",
        reason:
          snap.themes.includes("人工智能与硬科技") || snap.style === "growth"
            ? "与成长风格及硬科技主题叠加方向一致，并满足当前风险与流动性设定。"
            : "与当前市场、持有周期与风险档相匹配的港股大盘代表性标的。",
        snapshot_keys: keysD(["D1 交易市场", "D4 持有周期", "D5 风格", "D3 主题叠加"]),
      },
    ];
  }
  return [
    {
      code: "AAPL",
      name: "Apple Inc.",
      reason:
        snap.style === "momentum"
          ? "与动量/趋势风格一致，并符合美股市场与流动性设定。"
          : "与当前美股市场、持有周期与风险档相匹配的代表性标的。",
      snapshot_keys: keysD(["D1 交易市场", "D5 风格", "D6 风险承受", "D7 市值与流动性"]),
    },
  ];
}

function buildConsultReply(text: string): string {
  const raw = text.trim();
  const q = raw.toLowerCase();
  const hasRisk = /风险|回撤|止损|波动/.test(raw);
  const hasValuation = /估值|pe|pb|高估|低估|贵|便宜/.test(raw) || /\bpe\b|\bpb\b/.test(q);
  const hasSector = /行业|板块|赛道|主题|ai|新能源|红利/.test(raw);
  const hasTiming = /择时|买点|卖点|入场|离场|仓位|加仓|减仓/.test(raw);

  if (hasRisk) {
    return [
      "你的问题聚焦在风险控制，给你两条可执行建议：",
      "- 先定义单次决策最大亏损（例如 1R），再反推仓位大小。",
      "- 风险位优先使用结构失效位，而不是固定百分比止损。",
      "",
      "若需要候选标的，请选择「帮我选股」。",
    ].join("\n");
  }
  if (hasValuation) {
    return [
      "你的问题偏估值框架，给你两条可执行建议：",
      "- 估值不是单点结论，至少要和盈利增速、现金流质量一起看。",
      "",
      "若要落地到候选标的，可选择「帮我选股」。",
    ].join("\n");
  }
  if (hasSector) {
    return [
      "你的问题偏行业主题，给你两条可执行建议：",
      "- 行业分析先看景气方向，再看估值与资金拥挤度是否匹配。",
      "",
      "你可以点「帮我选股」，我会把行业偏好写入 D2/D3 条件。",
    ].join("\n");
  }
  if (hasTiming) {
    return [
      "你的问题偏择时执行，给你两条可执行建议：",
      "- 入场前先定义：触发条件、风险位、无效条件、目标区间。",
      "",
      "若你要我给候选标的，我可以直接切到「帮我选股」。",
    ].join("\n");
  }
  return [
    "已收到你的问题，给你两条可执行建议：",
    "- 先确认你的目标：短线交易、波段配置，还是中期持有。",
    "",
    "如果你想直接看到候选股票，请选择「帮我选股」。",
  ].join("\n");
}

export function createInitialPickerState(): PickerState {
  return {
    sessionId: `pick-${Date.now()}`,
    script: "start",
    messages: [{ id: "m0", role: "assistant", content: starterAssistantMessage, createdAt: Date.now() }],
    preference_snapshot: { ...defaultSnapshot },
    conversation_phase: "clarifying",
    candidate_stocks: [],
    suggested_actions: startActions,
    confirmedPreferenceSlots: 0,
    quotaBlocked: false,
  };
}

export function sendConsultUserText(s: PickerState, text: string): PickerState {
  const t = text.trim();
  if (!t) return s;
  let next = pushUser(s, t);
  if (next.script === "start" || next.script === "consult_reply") {
    next = pushAssistant(
      next,
      buildConsultReply(t),
      [
        { action_id: "intent_pick", label: "帮我选股", kind: "primary" },
        { action_id: "intent_consult", label: "继续咨询", kind: "secondary" },
      ],
      "clarifying",
      { script: "consult_reply" }
    );
  }
  return next;
}

export function applyPickerAction(s: PickerState, action_id: string): PickerState {
  if (action_id === "intent_consult") {
    let next = pushUser(s, "策略咨询");
    next = pushAssistant(
      next,
      "择时研究强调在风险可控前提下观察价格结构与波动边界；本工具不提供收益承诺。若需要候选标的，请选择「帮我选股」。",
      [
        { action_id: "intent_pick", label: "帮我选股", kind: "primary" },
        { action_id: "restart", label: "重新开始对话", kind: "secondary" },
      ],
      "clarifying",
      { script: "consult_reply" }
    );
    return next;
  }

  if (action_id === "intent_pick") {
    let next = pushUser(s, "帮我选股");
    next = {
      ...next,
      script: "pick_d1",
      suggested_actions: [],
      sessionId: `pick-${Date.now()}`,
    };
    return pushAssistant(
      next,
      "将进入筛股流程。请先确认 **D1 交易市场**（必选）。",
      [
        { action_id: "market_CN", label: "A 股", kind: "clarify" },
        { action_id: "market_HK", label: "港股", kind: "clarify" },
        { action_id: "market_US", label: "美股", kind: "clarify" },
      ],
      "clarifying"
    );
  }

  if (action_id.startsWith("toggle_sector_")) {
    const opt = SECTOR_OPTIONS.find((o) => o.action_id === action_id);
    if (!opt) return s;
    const prev = s.preference_snapshot;
    const has = prev.sectors.includes(opt.value);
    const sectors = has ? prev.sectors.filter((x) => x !== opt.value) : [...prev.sectors, opt.value];
    return {
      ...pushUser(s, `${has ? "取消" : "选择"}行业：${opt.label}`),
      preference_snapshot: { ...prev, sectors },
    };
  }

  if (action_id.startsWith("toggle_theme_")) {
    const map: Record<string, string> = {
      toggle_theme_dividend: "红利/高股息",
      toggle_theme_ne: "新能源产业链",
      toggle_theme_ai: "人工智能与硬科技",
    };
    const label = map[action_id];
    if (!label) return s;
    const prev = s.preference_snapshot;
    const has = prev.themes.includes(label);
    const themes = has ? prev.themes.filter((t) => t !== label) : [...prev.themes, label];
    return {
      ...pushUser(s, `${has ? "取消" : "选择"}主题：${label}`),
      preference_snapshot: { ...prev, themes },
    };
  }

  if (action_id.startsWith("toggle_excl_")) {
    const map: Record<string, string> = {
      toggle_excl_st: "exclude_st",
      toggle_excl_liq: "exclude_illiquid",
      toggle_excl_lev: "exclude_high_leverage",
    };
    const ex = map[action_id];
    if (!ex) return s;
    const prev = s.preference_snapshot;
    const has = prev.exclusions.includes(ex);
    const exclusions = has ? prev.exclusions.filter((e) => e !== ex) : [...prev.exclusions, ex];
    const label =
      action_id === "toggle_excl_st"
        ? "ST 与 *ST"
        : action_id === "toggle_excl_liq"
          ? "流动性过差标的"
          : "高负债或杠杆异常标的";
    return {
      ...pushUser(s, `${has ? "取消" : "选择"}排除：${label}`),
      preference_snapshot: { ...prev, exclusions },
    };
  }

  if (action_id.startsWith("market_")) {
    const m = action_id.replace("market_", "") as Market;
    const label = action_id === "market_CN" ? "A 股" : action_id === "market_HK" ? "港股" : "美股";
    let next = pushUser(s, label);
    const snap = { ...next.preference_snapshot, market: m };
    next = {
      ...next,
      preference_snapshot: snap,
      script: "pick_d2",
      confirmedPreferenceSlots: Math.max(next.confirmedPreferenceSlots, 1),
    };
    return pushAssistant(
      next,
      `已确认 **D1**：${label}。请选择 **D2 行业范围** 模式。`,
      [
        { action_id: "d2_unrestricted", label: "不限制行业", kind: "clarify" },
        { action_id: "d2_specified", label: "指定行业（GICS 一级）", kind: "clarify" },
      ],
      "clarifying"
    );
  }

  if (action_id === "d2_unrestricted") {
    let next = pushUser(s, "不限制行业");
    const snap: PreferenceSnapshot = {
      ...next.preference_snapshot,
      sector_mode: "unrestricted",
      sectors: [],
    };
    next = {
      ...next,
      preference_snapshot: snap,
      script: "pick_d4",
      confirmedPreferenceSlots: Math.max(next.confirmedPreferenceSlots, 2),
    };
    return pushAssistant(
      next,
      `${snapSummary(snap)} 请选择 **D4 分析持有周期**。`,
      [
        { action_id: "horizon_intraday", label: "日内至数日", kind: "clarify" },
        { action_id: "horizon_w1", label: "1～4 周", kind: "clarify" },
        { action_id: "horizon_m1", label: "1～3 个月", kind: "clarify" },
        { action_id: "horizon_m3", label: "3 个月以上", kind: "clarify" },
      ],
      "clarifying"
    );
  }

  if (action_id === "d2_specified") {
    let next = pushUser(s, "指定行业");
    const snap: PreferenceSnapshot = {
      ...next.preference_snapshot,
      sector_mode: "specified",
      sectors: [],
    };
    next = {
      ...next,
      preference_snapshot: snap,
      script: "pick_d2_sectors",
      confirmedPreferenceSlots: Math.max(next.confirmedPreferenceSlots, 2),
    };
    return pushAssistant(
      next,
      "请在下列 **GICS 一级行业（中文）** 中至少选择一类；可点选切换，确认后进入下一步。",
      sectorPickActions(),
      "clarifying"
    );
  }

  if (action_id === "d2_sectors_confirm") {
    const snap = s.preference_snapshot;
    if (snap.sector_mode !== "specified" || snap.sectors.length === 0) {
      return pushAssistant(
        s,
        "请至少选择一类行业，或改选「不限制行业」。",
        [
          { action_id: "d2_unrestricted", label: "改为不限制行业", kind: "secondary" },
          ...sectorPickActions(),
        ],
        "clarifying"
      );
    }
    let next = pushUser(s, "确认行业选择");
    next = { ...next, script: "pick_d4", confirmedPreferenceSlots: Math.max(next.confirmedPreferenceSlots, 2) };
    const s2 = next.preference_snapshot;
    return pushAssistant(
      next,
      `${snapSummary(s2)} 请选择 **D4 分析持有周期**。`,
      [
        { action_id: "horizon_intraday", label: "日内至数日", kind: "clarify" },
        { action_id: "horizon_w1", label: "1～4 周", kind: "clarify" },
        { action_id: "horizon_m1", label: "1～3 个月", kind: "clarify" },
        { action_id: "horizon_m3", label: "3 个月以上", kind: "clarify" },
      ],
      "clarifying"
    );
  }

  const horizonMap: Record<string, PreferenceSnapshot["holding_horizon"]> = {
    horizon_intraday: "intraday_to_days",
    horizon_w1: "w1_to_w4",
    horizon_m1: "m1_to_m3",
    horizon_m3: "m3_plus",
  };
  if (horizonMap[action_id]) {
    const label =
      action_id === "horizon_intraday"
        ? "日内至数日"
        : action_id === "horizon_w1"
          ? "1～4 周"
          : action_id === "horizon_m1"
            ? "1～3 个月"
            : "3 个月以上";
    let next = pushUser(s, label);
    const snap: PreferenceSnapshot = { ...next.preference_snapshot, holding_horizon: horizonMap[action_id] };
    next = {
      ...next,
      preference_snapshot: snap,
      script: "pick_d5",
      confirmedPreferenceSlots: Math.max(next.confirmedPreferenceSlots, 3),
    };
    return pushAssistant(
      next,
      `${snapSummary(snap)} 请选择 **D5 风格偏好**。`,
      [
        { action_id: "style_value", label: "价值", kind: "clarify" },
        { action_id: "style_growth", label: "成长", kind: "clarify" },
        { action_id: "style_momentum", label: "动量/趋势", kind: "clarify" },
        { action_id: "style_no", label: "无明确风格偏好", kind: "clarify" },
      ],
      "clarifying"
    );
  }

  const styleMap: Record<string, PreferenceSnapshot["style"]> = {
    style_value: "value",
    style_growth: "growth",
    style_momentum: "momentum",
    style_no: "no_preference",
  };
  if (styleMap[action_id]) {
    const label =
      action_id === "style_value"
        ? "价值"
        : action_id === "style_growth"
          ? "成长"
          : action_id === "style_momentum"
            ? "动量/趋势"
            : "无明确风格偏好";
    let next = pushUser(s, label);
    const snap: PreferenceSnapshot = { ...next.preference_snapshot, style: styleMap[action_id] };
    next = {
      ...next,
      preference_snapshot: snap,
      script: "pick_d6",
      confirmedPreferenceSlots: Math.max(next.confirmedPreferenceSlots, 4),
    };
    return pushAssistant(
      next,
      `${snapSummary(snap)} 请选择 **D6 风险承受档位**（与择时模块一致）。`,
      [
        { action_id: "risk_conservative", label: "保守", kind: "clarify" },
        { action_id: "risk_balanced", label: "平衡", kind: "clarify" },
        { action_id: "risk_aggressive", label: "进取", kind: "clarify" },
      ],
      "clarifying"
    );
  }

  if (action_id.startsWith("risk_")) {
    const tier =
      action_id === "risk_conservative"
        ? "conservative"
        : action_id === "risk_balanced"
          ? "balanced"
          : "aggressive";
    const label = tier === "conservative" ? "保守" : tier === "balanced" ? "平衡" : "进取";
    let next = pushUser(s, label);
    const snap: PreferenceSnapshot = { ...next.preference_snapshot, risk_tier: tier };
    next = {
      ...next,
      preference_snapshot: snap,
      script: "pick_d7",
      confirmedPreferenceSlots: Math.max(next.confirmedPreferenceSlots, 5),
    };
    return pushAssistant(
      next,
      `${snapSummary(snap)} 请选择 **D7 市值与流动性**。`,
      [
        { action_id: "cap_unrestricted", label: "不限制", kind: "clarify" },
        { action_id: "cap_large", label: "偏大中盘与流动性", kind: "clarify" },
        { action_id: "cap_small", label: "接受小盘高波动", kind: "clarify" },
      ],
      "clarifying"
    );
  }

  const capMap: Record<string, PreferenceSnapshot["cap_liquidity"]> = {
    cap_unrestricted: "unrestricted",
    cap_large: "large_mid_liquid",
    cap_small: "small_volatile_ok",
  };
  if (capMap[action_id]) {
    const label =
      action_id === "cap_unrestricted"
        ? "不限制"
        : action_id === "cap_large"
          ? "偏大中盘与流动性"
          : "接受小盘高波动";
    let next = pushUser(s, label);
    const snap: PreferenceSnapshot = { ...next.preference_snapshot, cap_liquidity: capMap[action_id] };
    next = {
      ...next,
      preference_snapshot: snap,
      script: "pick_d8",
      confirmedPreferenceSlots: Math.max(next.confirmedPreferenceSlots, 6),
    };
    return pushAssistant(
      next,
      `${snapSummary(snap)} 请选择 **D8 排除规则**（可多选；无需排除时点「进入主题叠加」）。`,
      [
        { action_id: "toggle_excl_st", label: "排除 ST 与 *ST", kind: "clarify" },
        { action_id: "toggle_excl_liq", label: "排除流动性过差标的", kind: "clarify" },
        { action_id: "toggle_excl_lev", label: "排除高负债或杠杆异常标的", kind: "clarify" },
        { action_id: "d8_done", label: "进入主题叠加（D3）", kind: "primary" },
      ],
      "clarifying"
    );
  }

  if (action_id === "d8_done") {
    let next = pushUser(s, "进入主题叠加");
    next = { ...next, script: "pick_d3", confirmedPreferenceSlots: Math.max(next.confirmedPreferenceSlots, 7) };
    const snap = next.preference_snapshot;
    return pushAssistant(
      next,
      `${snapSummary(snap)} **D3 主题叠加**（可选多项；可不选表示无主题叠加条件）。`,
      [
        { action_id: "toggle_theme_dividend", label: "红利/高股息", kind: "clarify" },
        { action_id: "toggle_theme_ne", label: "新能源产业链", kind: "clarify" },
        { action_id: "toggle_theme_ai", label: "人工智能与硬科技", kind: "clarify" },
        { action_id: "d3_done", label: "完成偏好并继续", kind: "primary" },
      ],
      "clarifying"
    );
  }

  if (action_id === "d3_done") {
    let next = pushUser(s, "完成偏好并继续");
    const snap = next.preference_snapshot;
    next = {
      ...next,
      script: "ready",
      conversation_phase: "ready_to_screen",
      confirmedPreferenceSlots: 8,
    };
    return pushAssistant(
      next,
      `${snapSummary(snap)} 偏好快照已齐套。你可一键用系统默认补全可选项，或直接生成候选标的。`,
      [
        { action_id: "fill_defaults", label: "用默认值补全可选项", kind: "secondary" },
        { action_id: "screen_now", label: "生成候选", kind: "primary" },
        { action_id: "restart", label: "重新开始", kind: "secondary" },
      ],
      "ready_to_screen"
    );
  }

  if (action_id === "fill_defaults") {
    let next = pushUser(s, "用默认值补全可选项");
    const base = next.preference_snapshot;
    const filled: PreferenceSnapshot = {
      ...base,
      sector_mode: base.sector_mode === "specified" && base.sectors.length === 0 ? "unrestricted" : base.sector_mode,
      sectors: base.sector_mode === "specified" && base.sectors.length === 0 ? [] : base.sectors,
      themes: base.themes.length ? base.themes : [],
      holding_horizon: base.holding_horizon ?? "m1_to_m3",
      style: base.style ?? "no_preference",
      risk_tier: base.risk_tier ?? "conservative",
      cap_liquidity: base.cap_liquidity ?? "large_mid_liquid",
      exclusions: base.exclusions ?? [],
      other_notes: base.other_notes ?? null,
    };
    next = {
      ...next,
      preference_snapshot: filled,
      conversation_phase: "ready_to_screen",
      script: "ready",
      confirmedPreferenceSlots: 8,
    };
    return pushAssistant(
      next,
      "已按产品默认规则确认可选项：未选主题视为无叠加；排除项以当前点选为准。",
      [
        { action_id: "screen_now", label: "生成候选", kind: "primary" },
        { action_id: "restart", label: "重新开始", kind: "secondary" },
      ],
      "ready_to_screen"
    );
  }

  if (action_id === "screen_now") {
    const u = pushUser(s, "生成候选");
    const candidates = buildCandidates(u.preference_snapshot);
    const actions: SuggestedAction[] = [{ action_id: "restart", label: "重新开始对话", kind: "secondary" }];
    return {
      ...u,
      script: "candidates",
      candidate_stocks: candidates,
      conversation_phase: "candidates_shown",
      confirmedPreferenceSlots: 8,
      suggested_actions: actions,
      messages: [
        ...u.messages,
        {
          id: nid(),
          role: "assistant",
          content: "候选标的已生成。你可点击候选进入股票预测，或重新开始本轮流程。",
          createdAt: Date.now(),
        },
      ],
    };
  }

  if (action_id === "restart") {
    return createInitialPickerState();
  }

  return s;
}

const PICKER_STORAGE = "zhputian-picker-mp-v1";

export function loadPickerState(): PickerState | null {
  try {
    const raw = wx.getStorageSync(PICKER_STORAGE);
    if (!raw || typeof raw !== "string") return null;
    return JSON.parse(raw) as PickerState;
  } catch {
    return null;
  }
}

export function savePickerState(state: PickerState): void {
  wx.setStorageSync(PICKER_STORAGE, JSON.stringify(state));
}
