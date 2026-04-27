"use client";

import { create } from "zustand";
import type {
  CandidateStock,
  ConversationPhase,
  Market,
  PreferenceSnapshot,
  SuggestedAction,
} from "@/lib/contracts/domain";
import { preferenceSnapshotSchema } from "@/lib/contracts/domain";
import { requestPickerTurnStream, type DialogueMode } from "@/lib/api/picker";
import { isMockFlowEnabled } from "@/lib/env";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSubscriptionStore } from "@/stores/use-subscription-store";

export type PickerMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export type PickerDialogueMode = DialogueMode;

type PickerScript =
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
  | "candidates"
  | "backend_dialogue";

type PickerState = {
  sessionId: string;
  script: PickerScript;
  dialogueMode: PickerDialogueMode;
  messages: PickerMessage[];
  preference_snapshot: PreferenceSnapshot;
  conversation_phase: ConversationPhase;
  candidate_stocks: CandidateStock[];
  suggested_actions: SuggestedAction[];
  streamingOptionsPending: boolean;
  sendPending: boolean;
  streamStatus: "idle" | "connecting" | "streaming";
  sendError: string | null;
  clearSendError: () => void;
  resumePrompt: boolean;
  quotaBlocked: boolean;
  clearQuotaBlocked: () => void;
  resetConversation: () => void;
  continueSession: () => void;
  removeMessage: (messageId: string) => void;
  setDialogueMode: (mode: PickerDialogueMode) => void;
  sendUserText: (text: string) => Promise<boolean>;
  applyAction: (action_id: string) => void;
  /** 仅修改交易市场（D1） */
  editMarket: () => void;
  /** 已确认结构化维度计数（D1～D8） */
  confirmedPreferenceSlots: number;
};

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

const SECTOR_OPTIONS: { action_id: string; label: string; value: string }[] = [
  { action_id: "toggle_sector_信息技术", label: "信息技术", value: "信息技术" },
  { action_id: "toggle_sector_金融", label: "金融", value: "金融" },
  { action_id: "toggle_sector_医疗保健", label: "医疗保健", value: "医疗保健" },
  { action_id: "toggle_sector_必需消费", label: "必需消费", value: "必需消费" },
  { action_id: "toggle_sector_工业", label: "工业", value: "工业" },
  { action_id: "toggle_sector_能源", label: "能源", value: "能源" },
];

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pushUser(set: (fn: (s: PickerState) => Partial<PickerState>) => void, content: string) {
  set((s) => ({
    messages: [...s.messages, { id: id(), role: "user", content, createdAt: Date.now() }],
  }));
}

function pushAssistant(
  set: (fn: (s: PickerState) => Partial<PickerState>) => void,
  content: string,
  actions: SuggestedAction[],
  phase: ConversationPhase,
  extra?: Partial<PickerState>,
) {
  set((s) => ({
    messages: [...s.messages, { id: id(), role: "assistant", content, createdAt: Date.now() }],
    suggested_actions: actions,
    conversation_phase: phase,
    streamingOptionsPending: false,
    ...extra,
  }));
}

function appendAssistantChunk(
  set: (fn: (s: PickerState) => Partial<PickerState>) => void,
  messageId: string,
  chunk: string,
) {
  if (!chunk) return;
  set((s) => ({
    messages: s.messages.map((msg) =>
      msg.id === messageId && msg.role === "assistant" ? { ...msg, content: `${msg.content}${chunk}` } : msg,
    ),
  }));
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

function snapSummary(s: PreferenceSnapshot) {
  const m = s.market === "CN" ? "A 股" : s.market === "HK" ? "港股" : "美股";
  const sectors =
    s.sector_mode === "specified" && s.sectors.length ? s.sectors.join("、") : "行业不限制";
  const risk = s.risk_tier === "conservative" ? "保守" : s.risk_tier === "balanced" ? "平衡" : "进取";
  return `根据你已选：${m}；${sectors}；持有周期 ${horizonLabel[s.holding_horizon]}；风格 ${styleLabel[s.style]}；风险档 ${risk}；市值与流动性 ${capLabel[s.cap_liquidity]}。`;
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

const startActions: SuggestedAction[] = [
  { action_id: "intent_consult", label: "随便问问", kind: "secondary" },
  { action_id: "intent_pick", label: "帮我选股", kind: "primary" },
];

const starterAssistantMessage =
  "你好，我是选股对话助手。你可以先「随便问问」市场与策略问题，或直接选择「帮我选股」进入 D1-D8 结构化流程。";
const INITIAL_SESSION_ID = "pick-session-initial";
const INITIAL_MESSAGE_ID = "pick-msg-initial";
const INITIAL_MESSAGE_CREATED_AT = 1713326400000; // 2024-04-17 16:00:00 UTC+8

function buildMockConsultReply(text: string) {
  const raw = text.trim();
  const q = raw.toLowerCase();
  const hasRisk = /风险|回撤|止损|波动/.test(raw);
  const hasValuation = /估值|pe|pb|高估|低估|贵|便宜/.test(raw) || /\bpe\b|\bpb\b/.test(q);
  const hasSector = /行业|板块|赛道|主题|ai|新能源|红利/.test(raw);
  const hasTiming = /择时|买点|卖点|入场|离场|仓位|加仓|减仓/.test(raw);

  if (hasRisk) {
    return [
      "你的问题聚焦在风险控制，mock 回答如下：",
      "- 先定义单次决策最大亏损（例如 1R），再反推仓位大小。",
      "- 风险位优先使用结构失效位，而不是固定百分比止损。",
      "- 同方向高相关标的不同时重仓，避免相关性放大回撤。",
      "- 若波动放大且成交结构恶化，优先降低总风险暴露。",
      "",
      "如果你愿意，我可以直接切换到「帮我选股」并把风险档位设为保守或平衡。",
    ].join("\n");
  }

  if (hasValuation) {
    return [
      "你的问题偏估值框架，mock 回答如下：",
      "- 估值不是单点结论，至少要和盈利增速、现金流质量一起看。",
      "- 同行业比较建议用区间（分位数）而不是绝对 PE 数字。",
      "- 高估不等于立刻下跌，低估不等于立刻上涨，仍需价格结构确认。",
      "- 交易决策可按“估值过滤 + 趋势确认 + 风险位管理”组合执行。",
      "",
      "若要落地到候选标的，我可以继续引导你进入结构化选股流程。",
    ].join("\n");
  }

  if (hasSector) {
    return [
      "你的问题偏行业主题，mock 回答如下：",
      "- 行业分析先看景气方向，再看估值与资金拥挤度是否匹配。",
      "- 主题交易要区分“中期产业逻辑”和“短期事件催化”。",
      "- 可把行业分成核心仓与卫星仓，避免单主题集中度过高。",
      "- 最终标的筛选建议叠加流动性与风险档位约束。",
      "",
      "你可以点「帮我选股」，我会把行业偏好写入 D2/D3 条件。",
    ].join("\n");
  }

  if (hasTiming) {
    return [
      "你的问题偏择时执行，mock 回答如下：",
      "- 入场前先定义：触发条件、风险位、无效条件、目标区间。",
      "- 若趋势延续但量价背离，先减仓而不是一次性清仓。",
      "- 若跌破关键风险位且反抽失败，应执行纪律离场。",
      "- 同一标的不建议在无新信号时频繁反复交易。",
      "",
      "若你要我给候选标的，我可以直接切到「帮我选股」。",
    ].join("\n");
  }

  return [
    "已收到你的问题，mock 回答如下：",
    "- 先确认你的目标：短线交易、波段配置，还是中期持有。",
    "- 再确认约束：风险承受、流动性偏好、可接受回撤。",
    "- 最后把问题转成可执行条件：入场、加减仓、失效触发。",
    "",
    "如果你想直接看到候选股票，我可以现在带你走「帮我选股」流程。",
  ].join("\n");
}

function buildExtensionQuestionActions(extensionQuestions: string[]): SuggestedAction[] {
  return extensionQuestions.slice(0, 5).map((question, index) => ({
    action_id: `extq_${index + 1}`,
    label: question,
    kind: "secondary" as const,
  }));
}

export const usePickerStore = create<PickerState>((set, get) => ({
  sessionId: INITIAL_SESSION_ID,
  script: "start",
  dialogueMode: "prompt",
  messages: [
    {
      id: INITIAL_MESSAGE_ID,
      role: "assistant",
      content: starterAssistantMessage,
      createdAt: INITIAL_MESSAGE_CREATED_AT,
    },
  ],
  preference_snapshot: defaultSnapshot,
  conversation_phase: "clarifying",
  candidate_stocks: [],
  suggested_actions: startActions,
  streamingOptionsPending: false,
  sendPending: false,
  streamStatus: "idle",
  sendError: null,
  resumePrompt: false,
  quotaBlocked: false,
  confirmedPreferenceSlots: 0,

  clearQuotaBlocked: () => set({ quotaBlocked: false }),
  clearSendError: () => set({ sendError: null }),

  resetConversation: () => {
    set({
      sessionId: id(),
      script: "start",
      dialogueMode: "prompt",
      messages: [{ id: id(), role: "assistant", content: starterAssistantMessage, createdAt: Date.now() }],
      preference_snapshot: defaultSnapshot,
      conversation_phase: "clarifying",
      candidate_stocks: [],
      suggested_actions: startActions,
      streamingOptionsPending: false,
      sendPending: false,
      streamStatus: "idle",
      sendError: null,
      resumePrompt: false,
      quotaBlocked: false,
      confirmedPreferenceSlots: 0,
    });
  },

  continueSession: () => {
    set({ resumePrompt: false });
    pushAssistant(set, "已载入上次会话。请选择下一步。", startActions, "clarifying");
  },

  removeMessage: (messageId) => {
    set((s) => ({
      messages: s.messages.filter((message) => message.id !== messageId),
    }));
  },

  setDialogueMode: (mode) => {
    set({
      dialogueMode: mode,
      suggested_actions: mode === "direct" ? [] : get().suggested_actions,
      streamingOptionsPending: false,
    });
  },

  editMarket: () => {
    set({ script: "pick_d1" });
    pushAssistant(
      set,
      "将仅修改 **D1 交易市场**。请重新选择市场。",
      [
        { action_id: "market_CN", label: "A 股", kind: "clarify" },
        { action_id: "market_HK", label: "港股", kind: "clarify" },
        { action_id: "market_US", label: "美股", kind: "clarify" },
      ],
      "clarifying",
    );
  },

  sendUserText: async (text) => {
    const t = text.trim();
    if (!t) return false;
    set({ sendPending: true, sendError: null, streamStatus: "connecting" });
    const currentSessionId = get().sessionId;
    let assistantMessageId = "";
    let chunkBuffer = "";
    let chunkFlushRaf: number | null = null;
    const flushBufferedChunks = () => {
      if (!assistantMessageId || !chunkBuffer) return;
      const next = chunkBuffer;
      chunkBuffer = "";
      appendAssistantChunk(set, assistantMessageId, next);
    };
    const scheduleChunkFlush = () => {
      if (chunkFlushRaf !== null) return;
      chunkFlushRaf = requestAnimationFrame(() => {
        chunkFlushRaf = null;
        flushBufferedChunks();
      });
    };
    try {
      pushUser(set, t);
      assistantMessageId = id();
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: assistantMessageId,
            role: "assistant",
            content: "",
            createdAt: Date.now(),
          },
        ],
      }));

      const requestMode = get().dialogueMode;
      const turn = await requestPickerTurnStream(
        { session_id: currentSessionId, text: t, mode: requestMode },
        {
          onChunk: (chunk) => {
            if (get().streamStatus === "connecting") {
              set({ streamStatus: "streaming" });
            }
            if (!chunk) return;
            chunkBuffer += chunk;
            scheduleChunkFlush();
          },
        },
      );

      if (chunkFlushRaf !== null) {
        cancelAnimationFrame(chunkFlushRaf);
        chunkFlushRaf = null;
      }
      flushBufferedChunks();

      if (!turn.response) {
        set((s) => ({
          messages: s.messages.map((msg) =>
            msg.id === assistantMessageId && msg.role === "assistant"
              ? { ...msg, content: "已收到你的问题，请继续补充你关注的条件。" }
              : msg,
          ),
        }));
      }
      const actions = buildExtensionQuestionActions(turn.extension_questions);
      set({
        suggested_actions: requestMode === "prompt" ? actions : [],
        conversation_phase: "clarifying",
        script: "backend_dialogue",
        sessionId: turn.session_id || currentSessionId,
        streamStatus: "idle",
      });
    } catch (error) {
      if (chunkFlushRaf !== null) {
        cancelAnimationFrame(chunkFlushRaf);
        chunkFlushRaf = null;
      }
      flushBufferedChunks();
      set({
        sendPending: false,
        streamStatus: "idle",
        sendError:
          error instanceof Error && error.message
            ? error.message
            : "消息发送失败，请检查网络后重试。",
      });
      if (assistantMessageId) {
        set((s) => ({
          messages: s.messages.filter((msg) => msg.id !== assistantMessageId),
        }));
      }
      return false;
    }
    set({ sendPending: false, streamStatus: "idle" });
    return true;
  },

  applyAction: (action_id) => {
    if (action_id.startsWith("extq_")) {
      const target = get().suggested_actions.find((action) => action.action_id === action_id);
      if (!target?.label || get().sendPending) return;
      void get().sendUserText(target.label);
      return;
    }

    if (action_id === "intent_consult") {
      pushUser(set, "随便问问");
      set({ script: "consult_reply", dialogueMode: "direct" });
      pushAssistant(
        set,
          "择时研究强调在风险可控前提下观察价格结构与波动边界；本工具不提供收益承诺。若需要候选列表，请选择「帮我选股」。",
        [
          { action_id: "intent_pick", label: "帮我选股", kind: "primary" },
          { action_id: "restart", label: "重新开始对话", kind: "secondary" },
        ],
        "clarifying",
      );
      return;
    }

    if (action_id === "intent_pick") {
      const guest = useAuthStore.getState().session === "guest";
      if (!isMockFlowEnabled() && !useSubscriptionStore.getState().tryConsumePickerSession(guest)) {
        set({ quotaBlocked: true });
        return;
      }
      pushUser(set, "帮我选股");
      set({ script: "pick_d1", dialogueMode: "prompt", streamingOptionsPending: true, suggested_actions: [] });
      window.setTimeout(() => {
        pushAssistant(
          set,
            "将进入筛股流程。请先确认 **D1 交易市场**（必选）。",
          [
            { action_id: "market_CN", label: "A 股", kind: "clarify" },
            { action_id: "market_HK", label: "港股", kind: "clarify" },
            { action_id: "market_US", label: "美股", kind: "clarify" },
          ],
          "clarifying",
        );
      }, 400);
      return;
    }

    if (action_id.startsWith("toggle_sector_")) {
      const opt = SECTOR_OPTIONS.find((o) => o.action_id === action_id);
      if (!opt) return;
      const st = get();
      const prev = st.preference_snapshot;
      const has = prev.sectors.includes(opt.value);
      const sectors = has ? prev.sectors.filter((s) => s !== opt.value) : [...prev.sectors, opt.value];
      pushUser(set, `${has ? "取消" : "选择"}行业：${opt.label}`);
      set({
        preference_snapshot: preferenceSnapshotSchema.parse({
          ...prev,
          sectors,
        }),
      });
      return;
    }

    if (action_id.startsWith("toggle_theme_")) {
      const map: Record<string, string> = {
        toggle_theme_dividend: "红利/高股息",
        toggle_theme_ne: "新能源产业链",
        toggle_theme_ai: "人工智能与硬科技",
      };
      const label = map[action_id];
      if (!label) return;
      const st = get();
      const prev = st.preference_snapshot;
      const has = prev.themes.includes(label);
      const themes = has ? prev.themes.filter((t) => t !== label) : [...prev.themes, label];
      pushUser(set, `${has ? "取消" : "选择"}主题：${label}`);
      set({ preference_snapshot: preferenceSnapshotSchema.parse({ ...prev, themes }) });
      return;
    }

    if (action_id.startsWith("toggle_excl_")) {
      const map: Record<string, string> = {
        toggle_excl_st: "exclude_st",
        toggle_excl_liq: "exclude_illiquid",
        toggle_excl_lev: "exclude_high_leverage",
      };
      const ex = map[action_id];
      if (!ex) return;
      const st = get();
      const prev = st.preference_snapshot;
      const has = prev.exclusions.includes(ex);
      const exclusions = has ? prev.exclusions.filter((e) => e !== ex) : [...prev.exclusions, ex];
      pushUser(
        set,
        `${has ? "取消" : "选择"}排除：${
          action_id === "toggle_excl_st"
            ? "ST 与 *ST"
            : action_id === "toggle_excl_liq"
              ? "流动性过差标的"
              : "高负债或杠杆异常标的"
        }`,
      );
      set({ preference_snapshot: preferenceSnapshotSchema.parse({ ...prev, exclusions }) });
      return;
    }

    if (action_id.startsWith("market_")) {
      const m = action_id.replace("market_", "") as Market;
      pushUser(set, action_id === "market_CN" ? "A 股" : action_id === "market_HK" ? "港股" : "美股");
      const st = get();
      const snap = { ...st.preference_snapshot, market: m };
      set({
        preference_snapshot: preferenceSnapshotSchema.parse(snap),
        script: "pick_d2",
        streamingOptionsPending: true,
        suggested_actions: [],
        confirmedPreferenceSlots: Math.max(st.confirmedPreferenceSlots, 1),
      });
      window.setTimeout(() => {
        pushAssistant(
          set,
            `已确认 **D1**：${m === "CN" ? "A 股" : m === "HK" ? "港股" : "美股"}。请选择 **D2 行业范围** 模式。`,
          [
            { action_id: "d2_unrestricted", label: "不限制行业", kind: "clarify" },
            { action_id: "d2_specified", label: "指定行业（GICS 一级）", kind: "clarify" },
          ],
          "clarifying",
        );
      }, 450);
      return;
    }

    if (action_id === "d2_unrestricted") {
      pushUser(set, "不限制行业");
      const prev = get().preference_snapshot;
      const snap = preferenceSnapshotSchema.parse({
        ...prev,
        sector_mode: "unrestricted",
        sectors: [],
      });
      set({
        preference_snapshot: snap,
        script: "pick_d4",
        streamingOptionsPending: true,
        suggested_actions: [],
        confirmedPreferenceSlots: Math.max(get().confirmedPreferenceSlots, 2),
      });
      window.setTimeout(() => {
        pushAssistant(
          set,
            `${snapSummary(snap)} 请选择 **D4 分析持有周期**。`,
          [
            { action_id: "horizon_intraday", label: "日内至数日", kind: "clarify" },
            { action_id: "horizon_w1", label: "1～4 周", kind: "clarify" },
            { action_id: "horizon_m1", label: "1～3 个月", kind: "clarify" },
            { action_id: "horizon_m3", label: "3 个月以上", kind: "clarify" },
          ],
          "clarifying",
        );
      }, 400);
      return;
    }

    if (action_id === "d2_specified") {
      pushUser(set, "指定行业");
      const prev = get().preference_snapshot;
      const snap = preferenceSnapshotSchema.parse({
        ...prev,
        sector_mode: "specified",
        sectors: [],
      });
      set({
        preference_snapshot: snap,
        script: "pick_d2_sectors",
        streamingOptionsPending: false,
        confirmedPreferenceSlots: Math.max(get().confirmedPreferenceSlots, 2),
      });
      pushAssistant(
        set,
        "请在下列 **GICS 一级行业（中文）** 中至少选择一类；可点选切换，确认后进入下一步。",
        sectorPickActions(),
        "clarifying",
      );
      return;
    }

    if (action_id === "d2_sectors_confirm") {
      const snap = get().preference_snapshot;
      if (snap.sector_mode !== "specified" || snap.sectors.length === 0) {
        pushAssistant(
          set,
          "请至少选择一类行业，或改选「不限制行业」。",
          [
            { action_id: "d2_unrestricted", label: "改为不限制行业", kind: "secondary" },
            ...sectorPickActions(),
          ],
          "clarifying",
        );
        return;
      }
      pushUser(set, "确认行业选择");
      set({
        script: "pick_d4",
        streamingOptionsPending: true,
        suggested_actions: [],
        confirmedPreferenceSlots: Math.max(get().confirmedPreferenceSlots, 2),
      });
      window.setTimeout(() => {
        const s = get().preference_snapshot;
        pushAssistant(
          set,
            `${snapSummary(s)} 请选择 **D4 分析持有周期**。`,
          [
            { action_id: "horizon_intraday", label: "日内至数日", kind: "clarify" },
            { action_id: "horizon_w1", label: "1～4 周", kind: "clarify" },
            { action_id: "horizon_m1", label: "1～3 个月", kind: "clarify" },
            { action_id: "horizon_m3", label: "3 个月以上", kind: "clarify" },
          ],
          "clarifying",
        );
      }, 400);
      return;
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
      pushUser(set, label);
      const prev = get().preference_snapshot;
      const snap = preferenceSnapshotSchema.parse({ ...prev, holding_horizon: horizonMap[action_id] });
      set({
        preference_snapshot: snap,
        script: "pick_d5",
        streamingOptionsPending: true,
        suggested_actions: [],
        confirmedPreferenceSlots: Math.max(get().confirmedPreferenceSlots, 3),
      });
      window.setTimeout(() => {
        pushAssistant(
          set,
            `${snapSummary(snap)} 请选择 **D5 风格偏好**。`,
          [
            { action_id: "style_value", label: "价值", kind: "clarify" },
            { action_id: "style_growth", label: "成长", kind: "clarify" },
            { action_id: "style_momentum", label: "动量/趋势", kind: "clarify" },
            { action_id: "style_no", label: "无明确风格偏好", kind: "clarify" },
          ],
          "clarifying",
        );
      }, 400);
      return;
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
      pushUser(set, label);
      const prev = get().preference_snapshot;
      const snap = preferenceSnapshotSchema.parse({ ...prev, style: styleMap[action_id] });
      set({
        preference_snapshot: snap,
        script: "pick_d6",
        streamingOptionsPending: true,
        suggested_actions: [],
        confirmedPreferenceSlots: Math.max(get().confirmedPreferenceSlots, 4),
      });
      window.setTimeout(() => {
        pushAssistant(
          set,
            `${snapSummary(snap)} 请选择 **D6 风险承受档位**（与择时模块一致）。`,
          [
            { action_id: "risk_conservative", label: "保守", kind: "clarify" },
            { action_id: "risk_balanced", label: "平衡", kind: "clarify" },
            { action_id: "risk_aggressive", label: "进取", kind: "clarify" },
          ],
          "clarifying",
        );
      }, 400);
      return;
    }

    if (action_id.startsWith("risk_")) {
      const tier =
        action_id === "risk_conservative"
          ? "conservative"
          : action_id === "risk_balanced"
            ? "balanced"
            : "aggressive";
      pushUser(set, tier === "conservative" ? "保守" : tier === "balanced" ? "平衡" : "进取");
      const prev = get().preference_snapshot;
      const snap = preferenceSnapshotSchema.parse({ ...prev, risk_tier: tier });
      set({
        preference_snapshot: snap,
        script: "pick_d7",
        streamingOptionsPending: true,
        suggested_actions: [],
        confirmedPreferenceSlots: Math.max(get().confirmedPreferenceSlots, 5),
      });
      window.setTimeout(() => {
        pushAssistant(
          set,
            `${snapSummary(snap)} 请选择 **D7 市值与流动性**。`,
          [
            { action_id: "cap_unrestricted", label: "不限制", kind: "clarify" },
            { action_id: "cap_large", label: "偏大中盘与流动性", kind: "clarify" },
            { action_id: "cap_small", label: "接受小盘高波动", kind: "clarify" },
          ],
          "clarifying",
        );
      }, 400);
      return;
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
      pushUser(set, label);
      const prev = get().preference_snapshot;
      const snap = preferenceSnapshotSchema.parse({ ...prev, cap_liquidity: capMap[action_id] });
      set({
        preference_snapshot: snap,
        script: "pick_d8",
        streamingOptionsPending: false,
        suggested_actions: [],
        confirmedPreferenceSlots: Math.max(get().confirmedPreferenceSlots, 6),
      });
      pushAssistant(
        set,
          `${snapSummary(snap)} 请选择 **D8 排除规则**（可多选；无需排除时点「进入主题叠加」）。`,
        [
          { action_id: "toggle_excl_st", label: "排除 ST 与 *ST", kind: "clarify" },
          { action_id: "toggle_excl_liq", label: "排除流动性过差标的", kind: "clarify" },
          { action_id: "toggle_excl_lev", label: "排除高负债或杠杆异常标的", kind: "clarify" },
          { action_id: "d8_done", label: "进入主题叠加（D3）", kind: "primary" },
        ],
        "clarifying",
      );
      return;
    }

    if (action_id === "d8_done") {
      pushUser(set, "进入主题叠加");
      const snap = get().preference_snapshot;
      set({
        script: "pick_d3",
        confirmedPreferenceSlots: Math.max(get().confirmedPreferenceSlots, 7),
      });
      pushAssistant(
        set,
          `${snapSummary(snap)} **D3 主题叠加**（可选多项；可不选表示无主题叠加条件）。`,
        [
          { action_id: "toggle_theme_dividend", label: "红利/高股息", kind: "clarify" },
          { action_id: "toggle_theme_ne", label: "新能源产业链", kind: "clarify" },
          { action_id: "toggle_theme_ai", label: "人工智能与硬科技", kind: "clarify" },
          { action_id: "d3_done", label: "完成偏好并继续", kind: "primary" },
        ],
        "clarifying",
      );
      return;
    }

    if (action_id === "d3_done") {
      pushUser(set, "完成偏好并继续");
      const snap = get().preference_snapshot;
      set({
        script: "ready",
        confirmedPreferenceSlots: 8,
        conversation_phase: "ready_to_screen",
      });
      pushAssistant(
        set,
          `${snapSummary(snap)} 偏好快照已齐套。你可一键用系统默认补全可选项（当前已齐套则等价于确认），或直接生成候选列表。`,
        [
          { action_id: "fill_defaults", label: "用默认值补全可选项", kind: "secondary" },
          { action_id: "screen_now", label: "生成候选", kind: "primary" },
          { action_id: "edit_market", label: "仅修改交易市场", kind: "secondary" },
          { action_id: "restart", label: "重新开始", kind: "secondary" },
        ],
        "ready_to_screen",
      );
      return;
    }

    if (action_id === "fill_defaults") {
      pushUser(set, "用默认值补全可选项");
      const base = get().preference_snapshot;
      const filled = preferenceSnapshotSchema.parse({
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
      });
      set({
        preference_snapshot: filled,
        conversation_phase: "ready_to_screen",
        script: "ready",
        confirmedPreferenceSlots: 8,
      });
      pushAssistant(
        set,
          "已按产品默认规则确认可选项：未选主题视为无叠加；排除项以当前点选为准。",
        [
          { action_id: "screen_now", label: "生成候选", kind: "primary" },
          { action_id: "restart", label: "重新开始", kind: "secondary" },
        ],
        "ready_to_screen",
      );
      return;
    }

    if (action_id === "screen_now") {
      pushUser(set, "生成候选");
      set({ streamingOptionsPending: true, suggested_actions: [], script: "candidates" });
      window.setTimeout(() => {
        const snap = get().preference_snapshot;
        const candidates = buildCandidates(snap);
        set((s) => ({
          candidate_stocks: candidates,
          conversation_phase: "candidates_shown",
          confirmedPreferenceSlots: 8,
          streamingOptionsPending: false,
          suggested_actions: [
            { action_id: "restart", label: "重新开始对话", kind: "secondary" },
            { action_id: "resume_later", label: "稍后继续", kind: "secondary" },
          ],
          messages: [
            ...s.messages,
            {
              id: id(),
              role: "assistant",
              content:
                "候选列表已生成。请在下方结果区选择标的进入单票择时分析；如需调整偏好，可使用「重新开始对话」。",
              createdAt: Date.now(),
            },
          ],
        }));
      }, 700);
      return;
    }

    if (action_id === "edit_market") {
      get().editMarket();
      return;
    }

    if (action_id === "restart") {
      get().resetConversation();
      return;
    }

    if (action_id === "resume_later") {
      set({ resumePrompt: true });
      pushAssistant(
        set,
          "你可随时返回本页；未结束的会话将在本机提示是否继续。",
        [
          { action_id: "resume_ok", label: "继续", kind: "primary" },
          { action_id: "restart", label: "重新开始", kind: "secondary" },
        ],
        "clarifying",
      );
      return;
    }

    if (action_id === "resume_ok") {
      get().continueSession();
      return;
    }
  },
}));
