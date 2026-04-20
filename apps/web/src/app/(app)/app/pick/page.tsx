"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  PencilLineIcon,
  SquarePenIcon,
  Trash2Icon,
  SearchIcon,
} from "lucide-react";
import { pickerCopy, subscriptionTierPublicCopy } from "@/lib/copy";
import { usePickerStore, type PickerMessage } from "@/stores/use-picker-store";
import { useAnalysisStore } from "@/stores/use-analysis-store";
import type {
  CandidateStock,
  ConversationPhase,
  PreferenceSnapshot,
  SuggestedAction,
} from "@/lib/contracts/domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageErrorState } from "@/components/features/page-state";
import { PickerChatEmpty, PickerChatMessage } from "@/components/features/picker-chat-message";

function isActionActive(actionId: string, s: PreferenceSnapshot) {
  if (actionId.startsWith("toggle_sector_")) {
    const sector = actionId.replace("toggle_sector_", "");
    return s.sectors.includes(sector);
  }
  if (actionId.startsWith("toggle_theme_")) {
    const map: Record<string, string> = {
      toggle_theme_dividend: "红利/高股息",
      toggle_theme_ne: "新能源产业链",
      toggle_theme_ai: "人工智能与硬科技",
    };
    const label = map[actionId];
    return label ? s.themes.includes(label) : false;
  }
  if (actionId.startsWith("toggle_excl_")) {
    const map: Record<string, string> = {
      toggle_excl_st: "exclude_st",
      toggle_excl_liq: "exclude_illiquid",
      toggle_excl_lev: "exclude_high_leverage",
    };
    const exclusion = map[actionId];
    return exclusion ? s.exclusions.includes(exclusion) : false;
  }
  if (actionId.startsWith("market_")) {
    return s.market === actionId.replace("market_", "");
  }
  if (actionId === "d2_unrestricted") return s.sector_mode === "unrestricted";
  if (actionId === "d2_specified") return s.sector_mode === "specified";
  if (actionId === "horizon_intraday") return s.holding_horizon === "intraday_to_days";
  if (actionId === "horizon_w1") return s.holding_horizon === "w1_to_w4";
  if (actionId === "horizon_m1") return s.holding_horizon === "m1_to_m3";
  if (actionId === "horizon_m3") return s.holding_horizon === "m3_plus";
  if (actionId === "style_value") return s.style === "value";
  if (actionId === "style_growth") return s.style === "growth";
  if (actionId === "style_momentum") return s.style === "momentum";
  if (actionId === "style_no") return s.style === "no_preference";
  if (actionId === "risk_conservative") return s.risk_tier === "conservative";
  if (actionId === "risk_balanced") return s.risk_tier === "balanced";
  if (actionId === "risk_aggressive") return s.risk_tier === "aggressive";
  if (actionId === "cap_unrestricted") return s.cap_liquidity === "unrestricted";
  if (actionId === "cap_large") return s.cap_liquidity === "large_mid_liquid";
  if (actionId === "cap_small") return s.cap_liquidity === "small_volatile_ok";
  return false;
}

function summarizeMessage(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "（空消息）";
  return normalized.length > 34 ? `${normalized.slice(0, 34)}…` : normalized;
}

function formatConversationListTime(ms: number) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(ms),
  );
}

type ConversationListItem = {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  snapshot: Pick<
    ReturnType<typeof usePickerStore.getState>,
    | "sessionId"
    | "script"
    | "messages"
    | "preference_snapshot"
    | "conversation_phase"
    | "candidate_stocks"
    | "suggested_actions"
    | "confirmedPreferenceSlots"
  >;
};

const MAX_DRAFT_CHARS = 600;
const DRAFT_STORAGE_PREFIX = "pick-draft:";
const PICKER_OPTIONS_PANEL_KEY = "pick-options-panel-open";
const MOCK_CONVERSATION_SEED_BASE_TS = 1713326400000;

const DEFAULT_PREFERENCE_SNAPSHOT: PreferenceSnapshot = {
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

const START_ACTIONS: SuggestedAction[] = [
  { action_id: "intent_consult", label: "随便问问", kind: "secondary" },
  { action_id: "intent_pick", label: "帮我选股", kind: "primary" },
];

function createConversationItem(args: {
  id: string;
  title: string;
  messages: PickerMessage[];
  updatedAt?: number;
  script?: ReturnType<typeof usePickerStore.getState>["script"];
  preference_snapshot?: PreferenceSnapshot;
  conversation_phase?: ConversationPhase;
  candidate_stocks?: CandidateStock[];
  suggested_actions?: SuggestedAction[];
  confirmedPreferenceSlots?: number;
}): ConversationListItem {
  const updatedAt = args.updatedAt ?? args.messages.at(-1)?.createdAt ?? 0;
  return {
    id: args.id,
    title: args.title,
    preview: summarizeMessage(args.messages.at(-1)?.content ?? "新对话"),
    updatedAt,
    snapshot: {
      sessionId: args.id,
      script: args.script ?? "start",
      messages: args.messages,
      preference_snapshot: args.preference_snapshot ?? DEFAULT_PREFERENCE_SNAPSHOT,
      conversation_phase: args.conversation_phase ?? "clarifying",
      candidate_stocks: args.candidate_stocks ?? [],
      suggested_actions: args.suggested_actions ?? START_ACTIONS,
      confirmedPreferenceSlots: args.confirmedPreferenceSlots ?? 0,
    },
  };
}

function buildMockConversationSeeds(): ConversationListItem[] {
  const now = MOCK_CONVERSATION_SEED_BASE_TS;
  return [
    createConversationItem({
      id: "mock-consult-seed",
      title: "随便问问 · 风险控制",
      updatedAt: now - 1000 * 60 * 90,
      script: "consult_reply",
      messages: [
        {
          id: "mock-consult-seed-assistant-1",
          role: "assistant",
          content: "你好，我是选股对话助手。可以先随便问问，也可以直接进入帮我选股流程。",
          createdAt: now - 1000 * 60 * 96,
        },
        {
          id: "mock-consult-seed-user-1",
          role: "user",
          content: "波动变大时怎么控制回撤？",
          createdAt: now - 1000 * 60 * 93,
        },
        {
          id: "mock-consult-seed-assistant-2",
          role: "assistant",
          content:
            "先定义单笔最大亏损，再用风险位反推仓位；若量价结构恶化，优先降杠杆而非死扛。",
          createdAt: now - 1000 * 60 * 90,
        },
      ],
      suggested_actions: [
        { action_id: "intent_pick", label: "帮我选股", kind: "primary" },
        { action_id: "intent_consult", label: "继续咨询", kind: "secondary" },
      ],
    }),
    createConversationItem({
      id: "mock-pick-seed",
      title: "帮我选股 · A股平衡",
      updatedAt: now - 1000 * 60 * 30,
      script: "candidates",
      conversation_phase: "candidates_shown",
      confirmedPreferenceSlots: 8,
      preference_snapshot: {
        ...DEFAULT_PREFERENCE_SNAPSHOT,
        market: "CN",
        style: "growth",
        risk_tier: "balanced",
        cap_liquidity: "large_mid_liquid",
      },
      messages: [
        {
          id: "mock-pick-seed-assistant-1",
          role: "assistant",
          content: "请先确认 D1 交易市场。",
          createdAt: now - 1000 * 60 * 40,
        },
        {
          id: "mock-pick-seed-user-1",
          role: "user",
          content: "A 股，平衡风险，偏成长。",
          createdAt: now - 1000 * 60 * 37,
        },
        {
          id: "mock-pick-seed-assistant-2",
          role: "assistant",
          content: "已生成候选。请在下方候选结果区选择标的进入择时分析。",
          createdAt: now - 1000 * 60 * 30,
        },
      ],
      suggested_actions: [
        { action_id: "restart", label: "重新开始对话", kind: "secondary" },
        { action_id: "resume_later", label: "稍后继续", kind: "secondary" },
      ],
    }),
  ];
}

function upsertConversationItem(items: ConversationListItem[], next: ConversationListItem) {
  const rest = items.filter((item) => item.id !== next.id);
  return [next, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
}

function pickConditionLines(snapshot: PreferenceSnapshot) {
  const market = snapshot.market === "CN" ? "A 股" : snapshot.market === "HK" ? "港股" : "美股";
  const horizon =
    snapshot.holding_horizon === "intraday_to_days"
      ? "日内至数日"
      : snapshot.holding_horizon === "w1_to_w4"
        ? "1～4 周"
        : snapshot.holding_horizon === "m1_to_m3"
          ? "1～3 个月"
          : "3 个月以上";
  const style =
    snapshot.style === "value"
      ? "价值"
      : snapshot.style === "growth"
        ? "成长"
        : snapshot.style === "momentum"
          ? "动量/趋势"
          : "无明确风格偏好";
  const risk =
    snapshot.risk_tier === "conservative"
      ? "保守"
      : snapshot.risk_tier === "balanced"
        ? "平衡"
        : "进取";
  const cap =
    snapshot.cap_liquidity === "unrestricted"
      ? "不限制"
      : snapshot.cap_liquidity === "large_mid_liquid"
        ? "偏大中盘与流动性"
        : "接受小盘高波动";
  const sectors =
    snapshot.sector_mode === "specified"
      ? snapshot.sectors.length
        ? snapshot.sectors.join("、")
        : "已选指定行业（待确认）"
      : "行业不限制";
  const themes = snapshot.themes.length ? snapshot.themes.join("、") : "无主题叠加";
  const exclusions = snapshot.exclusions.length ? snapshot.exclusions.join("、") : "无排除规则";

  return [
    { label: "市场", value: market },
    { label: "行业", value: sectors },
    { label: "周期", value: horizon },
    { label: "风格", value: style },
    { label: "风险", value: risk },
    { label: "流动性", value: cap },
    { label: "主题", value: themes },
    { label: "排除", value: exclusions },
  ];
}

function deriveConversationTitle(messages: PickerMessage[], script: ReturnType<typeof usePickerStore.getState>["script"]) {
  const firstUser = messages.find((m) => m.role === "user")?.content;
  if (firstUser) return summarizeMessage(firstUser);
  if (script === "consult_reply") return "随便问问";
  if (script.startsWith("pick_") || script === "ready" || script === "candidates") return "帮我选股";
  return "新对话";
}

function ConversationListItemRow({
  item,
  isActive,
  onSelect,
  onEditConversation,
  onDeleteConversation,
}: {
  item: ConversationListItem;
  isActive: boolean;
  onSelect: (conversationId: string) => void;
  onEditConversation: (item: ConversationListItem) => void;
  onDeleteConversation: (item: ConversationListItem) => void;
}) {
  return (
    <li className="group/item relative">
      <Button
        type="button"
        variant={isActive ? "secondary" : "ghost"}
        className="h-auto w-full min-w-0 flex-col items-start gap-1 px-2 py-2 text-left transition-[padding] group-hover/item:pr-9 group-focus-within/item:pr-9"
        onClick={() => onSelect(item.id)}
        aria-current={isActive ? "page" : undefined}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs font-medium">{item.title}</span>
          <time
            className="text-muted-foreground text-[11px] tabular-nums"
            dateTime={new Date(item.updatedAt).toISOString()}
          >
            {formatConversationListTime(item.updatedAt)}
          </time>
        </div>
        <span className="text-muted-foreground w-full truncate text-xs leading-relaxed">{item.preview}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`操作会话：${item.title}`}
              className="absolute top-1 right-1 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100"
            >
              <EllipsisVerticalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end" side="bottom" className="w-36">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onEditConversation(item)}>
              <PencilLineIcon />
              编辑标题
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDeleteConversation(item)}>
              <Trash2Icon />
              删除对话
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function ConversationListSection({
  items,
  activeId,
  onSelect,
  searchValue,
  onSearchChange,
  onNewConversation,
  onEditConversation,
  onDeleteConversation,
  className,
}: {
  items: ConversationListItem[];
  activeId: string | null;
  onSelect: (conversationId: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onNewConversation: () => void;
  onEditConversation: (item: ConversationListItem) => void;
  onDeleteConversation: (item: ConversationListItem) => void;
  className?: string;
}) {
  const hasSearch = searchValue.trim().length > 0;
  return (
    <section className={cn("flex min-h-0 flex-1 flex-col gap-2", className)} aria-label="对话历史列表">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">对话列表</h2>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          onClick={onNewConversation}
          aria-label="新建对话"
          title="新建对话"
        >
          <SquarePenIcon />
        </Button>
      </header>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索对话"
          aria-label="搜索对话列表"
        />
      </InputGroup>
      {items.length === 0 ? (
        <Empty className="min-h-0 flex-none gap-2 rounded-lg border border-dashed p-4">
          <EmptyHeader className="max-w-none items-start gap-1 text-left">
            <EmptyTitle>暂无会话</EmptyTitle>
            <EmptyDescription>
              {hasSearch ? "没有匹配的对话内容。可调整关键词重试。" : "暂无消息，发送第一条后会显示在这里。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1 pr-1">
          <ul className="flex flex-col gap-1" aria-label="会话条目">
            {items.map((item) => (
              <ConversationListItemRow
                key={item.id}
                item={item}
                isActive={activeId === item.id}
                onSelect={onSelect}
                onEditConversation={onEditConversation}
                onDeleteConversation={onDeleteConversation}
              />
            ))}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}

export default function PickPage() {
  const router = useRouter();
  const sessionId = usePickerStore((s) => s.sessionId);
  const messages = usePickerStore((s) => s.messages);
  const preference_snapshot = usePickerStore((s) => s.preference_snapshot);
  const conversation_phase = usePickerStore((s) => s.conversation_phase);
  const candidate_stocks = usePickerStore((s) => s.candidate_stocks);
  const suggested_actions = usePickerStore((s) => s.suggested_actions);
  const script = usePickerStore((s) => s.script);
  const streamingOptionsPending = usePickerStore((s) => s.streamingOptionsPending);
  const sendPending = usePickerStore((s) => s.sendPending);
  const sendError = usePickerStore((s) => s.sendError);
  const clearSendError = usePickerStore((s) => s.clearSendError);
  const quotaBlocked = usePickerStore((s) => s.quotaBlocked);
  const clearQuotaBlocked = usePickerStore((s) => s.clearQuotaBlocked);
  const resetConversation = usePickerStore((s) => s.resetConversation);
  const sendUserText = usePickerStore((s) => s.sendUserText);
  const applyAction = usePickerStore((s) => s.applyAction);
  const confirmedPreferenceSlots = usePickerStore((s) => s.confirmedPreferenceSlots);
  const [draftBySession, setDraftBySession] = useState<Record<string, string>>({});
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isImeComposingRef = useRef(false);
  const mainAreaRef = useRef<HTMLElement | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const chatScrollContentRef = useRef<HTMLDivElement | null>(null);
  const chatPinnedToBottomRef = useRef(true);
  const composerBarRef = useRef<HTMLDivElement | null>(null);
  const [chatPinnedToBottom, setChatPinnedToBottom] = useState(true);
  const [composerLiftPx, setComposerLiftPx] = useState(0);
  const [composerBottomGapPx, setComposerBottomGapPx] = useState(112);
  const [composerIsMobileFixed, setComposerIsMobileFixed] = useState(true);
  const [composerDesktopBounds, setComposerDesktopBounds] = useState<{ left?: number; width?: number }>(
    {},
  );
  const [conversationArchive, setConversationArchive] = useState<ConversationListItem[]>(
    buildMockConversationSeeds,
  );
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationTitleOverrides, setConversationTitleOverrides] = useState<Record<string, string>>({});
  const [renameDraft, setRenameDraft] = useState("");
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const pickPanelRestoredRef = useRef(false);
  const [pickPanelOpen, setPickPanelOpen] = useState(true);
  const draft = draftBySession[sessionId] ?? "";

  const setDraftForSession = useCallback(
    (next: string) => {
      const capped = next.slice(0, MAX_DRAFT_CHARS);
      setDraftBySession((prev) => {
        if (prev[sessionId] === capped) return prev;
        return { ...prev, [sessionId]: capped };
      });
    },
    [sessionId],
  );

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior) => {
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (behavior === "smooth") {
      viewport.scrollTo({ top, behavior: "smooth" });
    } else {
      viewport.scrollTop = top;
    }
  }, []);

  useLayoutEffect(() => {
    chatPinnedToBottomRef.current = chatPinnedToBottom;
  }, [chatPinnedToBottom]);

  useLayoutEffect(() => {
    const viewport = chatViewportRef.current;
    if (!viewport) return;

    const syncPinnedFromViewport = () => {
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const distanceFromBottom = maxScroll - viewport.scrollTop;
      const threshold = 80;
      const pinned = distanceFromBottom <= threshold;
      chatPinnedToBottomRef.current = pinned;
      setChatPinnedToBottom(pinned);
    };

    viewport.addEventListener("scroll", syncPinnedFromViewport, { passive: true });

    if (chatPinnedToBottomRef.current) {
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    }
    syncPinnedFromViewport();

    let raf0 = 0;
    let raf1 = 0;
    raf0 = requestAnimationFrame(() => {
      if (chatPinnedToBottomRef.current) {
        viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      }
      raf1 = requestAnimationFrame(() => {
        if (chatPinnedToBottomRef.current) {
          viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        }
        syncPinnedFromViewport();
      });
    });

    return () => {
      cancelAnimationFrame(raf0);
      cancelAnimationFrame(raf1);
      viewport.removeEventListener("scroll", syncPinnedFromViewport);
    };
  }, [messages, streamingOptionsPending]);

  useLayoutEffect(() => {
    const el = chatScrollContentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!chatPinnedToBottomRef.current) return;
        const viewport = chatViewportRef.current;
        if (!viewport) return;
        viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        const distanceFromBottom = maxScroll - viewport.scrollTop;
        const threshold = 80;
        const pinned = distanceFromBottom <= threshold;
        chatPinnedToBottomRef.current = pinned;
        setChatPinnedToBottom(pinned);
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [messages]);

  useEffect(() => {
    const vv = window.visualViewport;

    const update = () => {
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      setComposerIsMobileFixed(!isDesktop);

      if (isDesktop) {
        setComposerLiftPx(0);
        return;
      }

      if (!vv) {
        setComposerLiftPx(0);
        return;
      }

      const el = composerBarRef.current;
      if (!el) {
        setComposerLiftPx(0);
        return;
      }

      const barRect = el.getBoundingClientRect();
      const covered = barRect.bottom - vv.height - vv.offsetTop;
      setComposerLiftPx(covered > 0 ? Math.ceil(covered) : 0);
    };

    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => update();

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    mq.addEventListener("change", onMq);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  useEffect(() => {
    const updateBounds = () => {
      const main = mainAreaRef.current;
      if (!main) return;
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      if (!isDesktop) {
        setComposerDesktopBounds((prev) =>
          prev.left === undefined && prev.width === undefined ? prev : {},
        );
        return;
      }
      const rect = main.getBoundingClientRect();
      const nextLeft = Math.round(rect.left);
      const nextWidth = Math.round(rect.width);
      setComposerDesktopBounds((prev) =>
        prev.left === nextLeft && prev.width === nextWidth
          ? prev
          : { left: nextLeft, width: nextWidth },
      );
    };

    updateBounds();
    const main = mainAreaRef.current;
    const ro =
      main && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateBounds()) : null;
    if (ro && main) ro.observe(main);
    window.addEventListener("resize", updateBounds);
    window.addEventListener("scroll", updateBounds, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateBounds);
      window.removeEventListener("scroll", updateBounds);
    };
  }, []);

  const conversationMode = useMemo<"consult" | "pick" | null>(() => {
    if (script === "consult_reply") return "consult";
    if (
      script === "pick_d1" ||
      script === "pick_d2" ||
      script === "pick_d2_sectors" ||
      script === "pick_d3" ||
      script === "pick_d4" ||
      script === "pick_d5" ||
      script === "pick_d6" ||
      script === "pick_d7" ||
      script === "pick_d8" ||
      script === "ready" ||
      script === "candidates"
    ) {
      return "pick";
    }
    return null;
  }, [script]);

  const toolbar_actions = useMemo(
    () => suggested_actions.filter((a) => a.action_id !== "intent_consult" && a.action_id !== "intent_pick"),
    [suggested_actions],
  );

  const currentConversationItem = useMemo<ConversationListItem>(
    () =>
      createConversationItem({
        id: sessionId,
        title: conversationTitleOverrides[sessionId] ?? deriveConversationTitle(messages, script),
        messages,
        updatedAt: messages.at(-1)?.createdAt ?? messages.at(0)?.createdAt ?? 0,
        script,
        preference_snapshot,
        conversation_phase,
        candidate_stocks,
        suggested_actions,
        confirmedPreferenceSlots,
      }),
    [
      candidate_stocks,
      conversationTitleOverrides,
      confirmedPreferenceSlots,
      conversation_phase,
      messages,
      preference_snapshot,
      script,
      sessionId,
      suggested_actions,
    ],
  );

  const conversationListItems = useMemo(
    () => upsertConversationItem(conversationArchive, currentConversationItem),
    [conversationArchive, currentConversationItem],
  );

  const filteredConversationListItems = useMemo(() => {
    const q = conversationSearch.trim().toLowerCase();
    if (!q) return conversationListItems;
    return conversationListItems.filter((item) =>
      `${item.title} ${item.preview} ${formatConversationListTime(item.updatedAt)}`.toLowerCase().includes(q),
    );
  }, [conversationListItems, conversationSearch]);

  const pickConditionItems = useMemo(() => pickConditionLines(preference_snapshot), [preference_snapshot]);

  const switchConversation = useCallback(
    (conversationId: string) => {
      if (conversationId === sessionId) return;
      const target = conversationListItems.find((item) => item.id === conversationId);
      if (!target) return;
      setConversationArchive((prev) => upsertConversationItem(prev, currentConversationItem));
      chatPinnedToBottomRef.current = true;
      setChatPinnedToBottom(true);
      usePickerStore.setState({
        ...target.snapshot,
        sendPending: false,
        sendError: null,
        streamingOptionsPending: false,
        quotaBlocked: false,
        resumePrompt: false,
      });
    },
    [conversationListItems, currentConversationItem, sessionId],
  );

  const openRenameConversation = useCallback((item: ConversationListItem) => {
    setEditingConversationId(item.id);
    setRenameDraft(item.title);
  }, []);

  const submitRenameConversation = useCallback(() => {
    const targetId = editingConversationId;
    const nextTitle = renameDraft.trim();
    if (!targetId || !nextTitle) return;

    setConversationArchive((prev) =>
      prev.map((item) => (item.id === targetId ? { ...item, title: nextTitle } : item)),
    );
    setConversationTitleOverrides((prev) =>
      prev[targetId] === nextTitle ? prev : { ...prev, [targetId]: nextTitle },
    );
    setEditingConversationId(null);
  }, [editingConversationId, renameDraft]);

  const confirmDeleteConversation = useCallback(() => {
    const targetId = deletingConversationId;
    if (!targetId) return;

    const fallback = conversationListItems.find((item) => item.id !== targetId);

    setConversationArchive((prev) => prev.filter((item) => item.id !== targetId));
    setConversationTitleOverrides((prev) => {
      if (!(targetId in prev)) return prev;
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    setDraftBySession((prev) => {
      if (!(targetId in prev)) return prev;
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${targetId}`);
      } catch {
        // Ignore localStorage failures.
      }
    }

    if (targetId === sessionId) {
      if (fallback) {
        chatPinnedToBottomRef.current = true;
        setChatPinnedToBottom(true);
        usePickerStore.setState({
          ...fallback.snapshot,
          sendPending: false,
          sendError: null,
          streamingOptionsPending: false,
          quotaBlocked: false,
          resumePrompt: false,
        });
      } else {
        resetConversation();
      }
    }

    setDeletingConversationId(null);
  }, [conversationListItems, deletingConversationId, resetConversation, sessionId]);

  useEffect(() => {
    queueMicrotask(() => {
      if (typeof window === "undefined") return;
      try {
        const closed = window.localStorage.getItem(PICKER_OPTIONS_PANEL_KEY) === "0";
        setPickPanelOpen(!closed);
      } catch {
        // Ignore storage read failure.
      }
      pickPanelRestoredRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!pickPanelRestoredRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PICKER_OPTIONS_PANEL_KEY, pickPanelOpen ? "1" : "0");
    } catch {
      // Ignore storage write failure.
    }
  }, [pickPanelOpen]);

  const resizeDraftTextarea = useCallback(() => {
    const el = draftTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 320);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > 320 ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    resizeDraftTextarea();
  }, [draft, resizeDraftTextarea]);

  useEffect(() => {
    const el = composerBarRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const gap = Math.ceil(rect.height + composerLiftPx + 12);
        setComposerBottomGapPx((prev) => (prev === gap ? prev : gap));
      });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [
    composerIsMobileFixed,
    composerLiftPx,
    draft,
    sendPending,
    streamingOptionsPending,
    toolbar_actions.length,
    conversationMode,
  ]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sendPending) return;
    const ok = await sendUserText(text);
    if (ok) {
      setDraftForSession("");
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${sessionId}`);
        } catch {
          // Ignore localStorage failures (e.g. privacy mode / quota).
        }
      }
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${DRAFT_STORAGE_PREFIX}${sessionId}`;
    const timer = window.setTimeout(() => {
      try {
        if (!draft.trim()) {
          window.localStorage.removeItem(key);
          return;
        }
        window.localStorage.setItem(key, draft);
      } catch {
        // Ignore localStorage failures (e.g. privacy mode / quota).
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [draft, sessionId]);

  return (
    <AppPageLayout
      title="选股对话"
      hideHeader
      fillHeight
      className="flex flex-1 flex-col"
      contentClassName="flex min-h-0 flex-1 flex-col gap-4 md:grid md:flex-1 md:grid-cols-[minmax(0,22rem)_1fr] md:items-stretch md:gap-6"
    >
      <aside className="flex min-h-0 flex-col md:h-full md:min-h-0" aria-label="选股会话侧栏">
        <ConversationListSection
          className="rounded-xl border bg-card p-4"
          items={filteredConversationListItems}
          activeId={sessionId}
          onSelect={switchConversation}
          searchValue={conversationSearch}
          onSearchChange={setConversationSearch}
          onEditConversation={openRenameConversation}
          onDeleteConversation={(item) => setDeletingConversationId(item.id)}
          onNewConversation={() => {
            setConversationArchive((prev) => upsertConversationItem(prev, currentConversationItem));
            setConversationSearch("");
            resetConversation();
          }}
        />
      </aside>

      <main
        ref={mainAreaRef}
        className="relative isolate flex min-h-0 flex-1 flex-col md:h-full md:min-h-0"
      >
        <section className="flex min-h-0 flex-1 flex-col gap-3 px-1 pb-2 md:px-0 md:pb-0" aria-label="对话消息区域">
          <div className="relative min-h-0 flex-1">
            <ScrollArea
              className="size-full"
              viewportRef={chatViewportRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              aria-label="选股对话消息"
            >
              <div
                ref={chatScrollContentRef}
                className="flex flex-col pr-1"
                style={{
                  paddingBottom: `calc(${composerBottomGapPx}px + env(safe-area-inset-bottom))`,
                }}
              >
                {messages.length === 0 ? (
                  <div className="mx-auto w-full max-w-3xl">
                    <PickerChatEmpty mode={conversationMode} />
                  </div>
                ) : (
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                    {messages.map((m) => (
                      <PickerChatMessage
                        key={m.id}
                        message={m}
                        anchorId={`pick-msg-item-${m.id}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
            {!chatPinnedToBottom ? (
              <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="pointer-events-auto shadow-sm"
                  onClick={() => {
                    chatPinnedToBottomRef.current = true;
                    setChatPinnedToBottom(true);
                    scrollChatToBottom("smooth");
                  }}
                >
                  <ArrowDownIcon data-icon="inline-start" />
                  回到底部
                </Button>
              </div>
            ) : null}
          </div>

          {conversation_phase === "candidates_shown" && candidate_stocks.length > 0 ? (
            <section className="border-t border-border/40 pt-3" aria-label="候选结果">
              <p className="text-muted-foreground mb-2 text-xs leading-relaxed">{pickerCopy.candidatesSyncNote}</p>
              <header className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <p className="text-sm font-medium">候选结果</p>
                <p className="text-muted-foreground text-xs">{pickerCopy.candidatesCardDesc}</p>
              </header>
              <ul className="max-h-[min(40svh,18rem)] overflow-y-auto pr-1">
                {candidate_stocks.map((c) => (
                  <li key={c.code} className="border-b border-border/40 py-3 last:border-b-0">
                    <p className="text-sm font-medium">
                      {c.name} <span className="text-muted-foreground font-normal">({c.code})</span>
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed whitespace-pre-wrap">{c.reason}</p>
                    {c.snapshot_keys.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.snapshot_keys.map((k) => (
                          <Badge key={k} variant="outline">
                            {k}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          useAnalysisStore.getState().setPendingHandoff({
                            symbol: c.code,
                            market: preference_snapshot.market,
                            preference_snapshot,
                          });
                          router.push("/app/analyze");
                        }}
                      >
                        进入择时
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {sendError ? (
            <PageErrorState
              title="消息发送失败"
              description={sendError}
              actions={
                <>
                  <Button type="button" size="sm" variant="secondary" onClick={() => void handleSend()}>
                    重试发送
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={clearSendError}>
                    关闭提示
                  </Button>
                </>
              }
            />
          ) : null}
        </section>

        <section
          ref={composerBarRef}
          style={{
            bottom: composerLiftPx ? `${composerLiftPx}px` : undefined,
            left:
              composerDesktopBounds.left !== undefined ? `${composerDesktopBounds.left}px` : undefined,
            width:
              composerDesktopBounds.width !== undefined
                ? `${composerDesktopBounds.width}px`
                : undefined,
          }}
          className="fixed inset-x-0 bottom-0 z-50 md:inset-x-auto"
          aria-label="消息输入区"
        >
          <FieldGroup className="bg-background">
            <Field>
              <FieldLabel htmlFor="pick-input" className="sr-only">
                消息输入
              </FieldLabel>

                {streamingOptionsPending ? (
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Spinner />
                    {pickerCopy.optionsLoading}
                  </div>
                ) : conversationMode === "pick" ? (
                <Collapsible open={pickPanelOpen} onOpenChange={setPickPanelOpen}>
                  <div className="rounded-lg border">
                      <CollapsibleTrigger
                        className="hover:bg-muted/60 flex w-full items-center justify-between px-2 py-1.5 text-left transition-colors"
                        aria-label="展开或收起选股条件与选项"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight">选股条件与选项</p>
                          <p className="text-muted-foreground text-xs leading-snug">
                            {pickConditionItems.length} 条条件 · {toolbar_actions.length} 个可选项
                          </p>
                        </div>
                        <ChevronDownIcon
                          className={cn("size-4 shrink-0 transition-transform", pickPanelOpen ? "rotate-180" : "")}
                        />
                      </CollapsibleTrigger>
                    <CollapsibleContent className="border-t px-2 py-1.5">
                      <dl className="grid gap-0.5 sm:grid-cols-2">
                          {pickConditionItems.map((item) => (
                          <div key={item.label} className="bg-muted/80 rounded-md px-1.5 py-1">
                            <dt className="text-muted-foreground text-xs leading-none">{item.label}</dt>
                            <dd className="truncate pt-0.5 text-xs leading-tight">{item.value}</dd>
                          </div>
                          ))}
                      </dl>
                        {toolbar_actions.length === 0 ? (
                          <Empty className="mt-1.5 min-h-0 flex-none gap-1 rounded-md border border-dashed p-2">
                            <EmptyDescription className="text-xs">当前步骤暂无可选项。</EmptyDescription>
                          </Empty>
                        ) : (
                          <ul className="mt-1 flex flex-wrap gap-1" aria-label="选股可选项">
                            {toolbar_actions.map((a) => (
                              <li key={a.action_id}>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant={
                                    isActionActive(a.action_id, preference_snapshot)
                                      ? "default"
                                      : a.kind === "primary"
                                        ? "secondary"
                                        : "outline"
                                  }
                                  aria-label={`选股选项：${a.label}`}
                                  disabled={sendPending}
                                  onClick={() => applyAction(a.action_id)}
                                >
                                  {a.label}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
                ) : toolbar_actions.length > 0 ? (
                  <ul
                    className="flex gap-1 overflow-x-auto rounded-lg border px-2 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    aria-label="建议操作"
                  >
                    {toolbar_actions.map((a) => (
                      <li key={a.action_id}>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            isActionActive(a.action_id, preference_snapshot)
                              ? "default"
                              : a.kind === "primary"
                                ? "secondary"
                                : "outline"
                          }
                          aria-label={`建议操作：${a.label}`}
                          disabled={sendPending}
                          onClick={() => applyAction(a.action_id)}
                        >
                          {a.label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <InputGroup
                  data-disabled={sendPending ? "true" : undefined}
                  className="h-auto has-disabled:bg-background has-disabled:opacity-100"
                >
                  <InputGroupTextarea
                    ref={draftTextareaRef}
                    id="pick-input"
                    value={draft}
                    placeholder={pickerCopy.inputPlaceholder}
                    disabled={sendPending}
                    aria-invalid={sendError ? true : undefined}
                    className="max-h-[min(40svh,18rem)] min-h-26 px-3 py-3 md:min-h-30"
                    maxLength={MAX_DRAFT_CHARS}
                    onCompositionStart={() => {
                      isImeComposingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                      isImeComposingRef.current = false;
                    }}
                    onChange={(e) => {
                      if (sendError) clearSendError();
                      setDraftForSession(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        if (isImeComposingRef.current || e.nativeEvent.isComposing) return;
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />

                  <InputGroupAddon
                    align="block-end"
                    className="border-t justify-between gap-2 group-data-[disabled=true]/input-group:opacity-100"
                  >
                    <Select
                      value={conversationMode ?? "unset"}
                      onValueChange={(v) => {
                        if (!v || sendPending || streamingOptionsPending) return;
                        if (v === "unset") return;
                        if (v === "consult") applyAction("intent_consult");
                        if (v === "pick") applyAction("intent_pick");
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label="对话模式"
                        disabled={sendPending || streamingOptionsPending}
                      >
                        <SelectValue placeholder="对话模式" />
                      </SelectTrigger>
                      <SelectContent side="top" align="start">
                        <SelectGroup>
                          <SelectItem value="unset" disabled>
                            选择模式
                          </SelectItem>
                          <SelectItem value="consult">随便问问</SelectItem>
                          <SelectItem value="pick">帮我选股</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <InputGroupButton
                            type="button"
                            size="icon-sm"
                            variant="default"
                            disabled={sendPending || !draft.trim()}
                            onClick={() => void handleSend()}
                            aria-label={sendPending ? "发送中" : "发送消息"}
                          >
                            {sendPending ? <Spinner /> : <ArrowUpIcon />}
                          </InputGroupButton>
                        }
                      />
                      <TooltipContent side="top" align="end">
                        <div className="flex flex-col gap-1.5 text-xs">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <KbdGroup>
                              <Kbd>Enter</Kbd>
                            </KbdGroup>
                            <span>发送</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <KbdGroup>
                              <Kbd>Shift</Kbd>
                              <span aria-hidden className="px-0.5 text-xs opacity-80">
                                +
                              </span>
                              <Kbd>Enter</Kbd>
                            </KbdGroup>
                            <span>换行</span>
                          </span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </InputGroupAddon>
                </InputGroup>
            </Field>
          </FieldGroup>
        </section>
      </main>

      <AlertDialog
        open={quotaBlocked}
        onOpenChange={(o) => {
          if (!o) clearQuotaBlocked();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>选股会话配额已满</AlertDialogTitle>
            <AlertDialogDescription>{pickerCopy.quotaDialogBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>关闭</AlertDialogCancel>
            <Button type="button" render={<Link href="/subscription" />}>
              {subscriptionTierPublicCopy.ctaViewPlansShort}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(editingConversationId)}
        onOpenChange={(open) => {
          if (!open) setEditingConversationId(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>编辑会话标题</DialogTitle>
            <DialogDescription>修改后会在左侧会话列表实时更新。</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="conversation-title-input">会话标题</FieldLabel>
              <Input
                id="conversation-title-input"
                value={renameDraft}
                maxLength={40}
                onChange={(e) => setRenameDraft(e.target.value)}
                placeholder="输入会话标题"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingConversationId(null)}>
              取消
            </Button>
            <Button type="button" onClick={submitRenameConversation} disabled={!renameDraft.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deletingConversationId)}
        onOpenChange={(open) => {
          if (!open) setDeletingConversationId(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复，确认继续吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteConversation}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppPageLayout>
  );
}
