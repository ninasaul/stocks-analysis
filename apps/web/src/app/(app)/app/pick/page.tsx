"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  MessageSquareIcon,
  PencilLineIcon,
  PlusIcon,
  TagsIcon,
  TrendingUpIcon,
  SquarePenIcon,
  Trash2Icon,
  SearchIcon,
} from "lucide-react";
import { analyzeCopy, pickerCopy, subscriptionTierPublicCopy } from "@/lib/copy";
import { usePickerStore, type PickerDialogueMode, type PickerMessage } from "@/stores/use-picker-store";
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
import {
  ANALYZE_SYMBOL_MOCK_UNIVERSE,
  type AnalyzeSymbolSearchItem,
} from "@/lib/analyze-symbol-search";
import { requestAddStockPortfolio, requestStockPortfolio } from "@/lib/api/stocks";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageErrorState } from "@/components/features/page-state";
import { AnalyzeRunConfigDialog } from "@/components/features/analyze-run-config-dialog";
import { PickerChatEmpty, PickerChatMessage } from "@/components/features/picker-chat-message";
import { useAuthStore } from "@/stores/use-auth-store";

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
    | "dialogueMode"
    | "messages"
    | "preference_snapshot"
    | "conversation_phase"
    | "candidate_stocks"
    | "suggested_actions"
    | "confirmedPreferenceSlots"
  >;
};

type ExtractedStock = {
  name: string;
  code: string;
  displayCode?: string;
};

const MAX_DRAFT_CHARS = 600;
const DRAFT_STORAGE_PREFIX = "pick-draft:";
const PICKER_ARCHIVE_STORAGE_KEY = "pick-conversation-archive-v1";
const PICKER_TITLE_STORAGE_KEY = "pick-conversation-title-v1";
const PICKER_ACTIVE_SESSION_STORAGE_KEY = "pick-active-session-id-v1";
const PICKER_ACTIVE_SNAPSHOT_STORAGE_KEY = "pick-active-snapshot-v1";
const WATCHLIST_STORAGE_KEY_V2 = "app-watchlist-v2";

const suggestedActionMarkdownComponents: Components = {
  p: ({ children }) => <span>{children}</span>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
  ul: ({ children }) => <span className="inline-flex flex-wrap gap-1">{children}</span>,
  ol: ({ children }) => <span className="inline-flex flex-wrap gap-1">{children}</span>,
  li: ({ children }) => <span>{children}</span>,
};

function SuggestedActionMarkdown({ content }: { content: string }) {
  return (
    <span className="line-clamp-1 min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={suggestedActionMarkdownComponents}>
        {content}
      </ReactMarkdown>
    </span>
  );
}

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

const conversationModeLabels: Record<"consult" | "pick" | "unset", string> = {
  consult: "随便问问",
  pick: "帮我选股",
  unset: "选择模式",
};

const conversationModeIcons: Record<"consult" | "pick" | "unset", React.ComponentType<{ className?: string }>> = {
  consult: MessageSquareIcon,
  pick: TrendingUpIcon,
  unset: ChevronDownIcon,
};

function createConversationItem(args: {
  id: string;
  title: string;
  messages: PickerMessage[];
  updatedAt?: number;
  script?: ReturnType<typeof usePickerStore.getState>["script"];
  dialogueMode?: PickerDialogueMode;
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
      dialogueMode: args.dialogueMode ?? "prompt",
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
  return [];
}

function upsertConversationItem(items: ConversationListItem[], next: ConversationListItem) {
  const rest = items.filter((item) => item.id !== next.id);
  return [next, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
}

function deriveConversationTitle(messages: PickerMessage[], script: ReturnType<typeof usePickerStore.getState>["script"]) {
  const firstUser = messages.find((m) => m.role === "user")?.content;
  if (firstUser) return summarizeMessage(firstUser);
  if (script === "consult_reply") return "随便问问";
  if (script.startsWith("pick_") || script === "ready" || script === "candidates") return "帮我选股";
  return "新对话";
}

function toMessageTime(timestamp?: string) {
  if (!timestamp) return Date.now();
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? Date.now() : ms;
}

function extractStocksFromText(content: string): ExtractedStock[] {
  const result: ExtractedStock[] = [];
  // Strict code format: 6 digits + "." + 2 letters (normalized to uppercase)
  const strictCodePattern = /\b(\d{6}\.[A-Za-z]{2})\b/g;
  const withBracketNamePattern =
    /\b(\d{6}\.[A-Za-z]{2})\b\s*[（(]\s*([A-Za-z0-9\u4E00-\u9FFF·\- ]{1,40})\s*[)）]/g;
  const withSpaceNamePattern = /\b(\d{6}\.[A-Za-z]{2})\b[\s,，:：]+([A-Za-z0-9\u4E00-\u9FFF·\- ]{1,40})/g;
  const nameFirstWithBracketCodePattern =
    /([A-Za-z0-9\u4E00-\u9FFF·\- ]{1,40})\s*[（(]\s*(\d{6}\.[A-Za-z]{2})\s*[)）]/g;
  const legacyNameFirstNoSuffixPattern =
    /([A-Za-z0-9\u4E00-\u9FFF·\- ]{1,40})\s*[（(]\s*(\d{6})\s*[)）]/g;
  const legacyCodeFirstNoSuffixPattern =
    /\b(\d{6})\b\s*[（(]\s*([A-Za-z0-9\u4E00-\u9FFF·\- ]{1,40})\s*[)）]/g;
  const legacyBareCodePattern = /\b(\d{6})\b/g;

  let match: RegExpExecArray | null = withBracketNamePattern.exec(content);
  while (match) {
    const rawCode = String(match[1] ?? "").trim().toUpperCase();
    const name = String(match[2] ?? "").trim();
    const code = rawCode.split(".")[0]?.trim().toUpperCase() ?? "";
    const displayCode = rawCode;
    if (name && code) {
      result.push({ name, code, displayCode });
    }
    match = withBracketNamePattern.exec(content);
  }

  match = withSpaceNamePattern.exec(content);
  while (match) {
    const rawCode = String(match[1] ?? "").trim().toUpperCase();
    const name = String(match[2] ?? "").trim();
    const code = rawCode.split(".")[0]?.trim().toUpperCase() ?? "";
    const displayCode = rawCode;
    if (name && code) {
      result.push({ name, code, displayCode });
    }
    match = withSpaceNamePattern.exec(content);
  }

  // Compatibility: 洋河股份（002304.SZ）
  match = nameFirstWithBracketCodePattern.exec(content);
  while (match) {
    const name = String(match[1] ?? "").trim();
    const rawCode = String(match[2] ?? "").trim().toUpperCase();
    const code = rawCode.split(".")[0]?.trim().toUpperCase() ?? "";
    const displayCode = rawCode;
    if (name && code) {
      result.push({ name, code, displayCode });
    }
    match = nameFirstWithBracketCodePattern.exec(content);
  }

  // Legacy compatibility: 洋河股份（002304）
  match = legacyNameFirstNoSuffixPattern.exec(content);
  while (match) {
    const name = String(match[1] ?? "").trim();
    const rawCode = String(match[2] ?? "").trim().toUpperCase();
    const code = rawCode;
    if (name && code) {
      result.push({ name, code, displayCode: rawCode });
    }
    match = legacyNameFirstNoSuffixPattern.exec(content);
  }

  // Legacy compatibility: 002304（洋河股份）
  match = legacyCodeFirstNoSuffixPattern.exec(content);
  while (match) {
    const rawCode = String(match[1] ?? "").trim().toUpperCase();
    const name = String(match[2] ?? "").trim();
    const code = rawCode;
    if (name && code) {
      result.push({ name, code, displayCode: rawCode });
    }
    match = legacyCodeFirstNoSuffixPattern.exec(content);
  }

  // Fallback when only code is present without explicit name
  match = strictCodePattern.exec(content);
  while (match) {
    const rawCode = String(match[1] ?? "").trim().toUpperCase();
    const code = rawCode.split(".")[0]?.trim().toUpperCase() ?? "";
    if (code) {
      result.push({ name: rawCode, code, displayCode: rawCode });
    }
    match = strictCodePattern.exec(content);
  }

  // Legacy fallback when only 6-digit code is present
  match = legacyBareCodePattern.exec(content);
  while (match) {
    const rawCode = String(match[1] ?? "").trim().toUpperCase();
    if (rawCode) {
      result.push({ name: rawCode, code: rawCode, displayCode: rawCode });
    }
    match = legacyBareCodePattern.exec(content);
  }
  return result;
}

function extractUniqueStocksFromConversations(items: ConversationListItem[]): ExtractedStock[] {
  const byCode = new Map<string, ExtractedStock>();
  for (const item of items) {
    for (const candidate of item.snapshot.candidate_stocks) {
      const code = String(candidate.code ?? "").trim().toUpperCase();
      const name = String(candidate.name ?? "").trim();
      if (!code) continue;
      if (!byCode.has(code)) {
        byCode.set(code, { name: name || code, code });
      }
    }
    for (const message of item.snapshot.messages) {
      for (const stock of extractStocksFromText(message.content)) {
        if (!byCode.has(stock.code)) {
          byCode.set(stock.code, stock);
        }
      }
    }
  }
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code, "en"));
}

function extractUniqueStocksFromMessages(messages: PickerMessage[]): ExtractedStock[] {
  const byCode = new Map<string, ExtractedStock>();
  for (const message of messages) {
    for (const stock of extractStocksFromText(message.content)) {
      if (!byCode.has(stock.code)) {
        byCode.set(stock.code, stock);
        continue;
      }
      const existing = byCode.get(stock.code);
      if (existing && !existing.displayCode && stock.displayCode?.includes(".")) {
        byCode.set(stock.code, stock);
      }
    }
  }
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code, "en"));
}

function normalizeStockCode(raw: string): { code: string; displayCode: string } | null {
  const normalized = raw.trim().toUpperCase();
  if (/^\d{6}\.[A-Z]{2}$/.test(normalized)) {
    return {
      code: normalized.split(".")[0] ?? normalized,
      displayCode: normalized,
    };
  }
  if (/^\d{6}$/.test(normalized)) {
    return { code: normalized, displayCode: normalized };
  }
  return null;
}

function inferMarketFromCode(code: string): "CN" | "HK" | "US" {
  const normalized = code.trim().toUpperCase();
  if (/^\d{5}$/.test(normalized)) return "HK";
  if (/^\d{6}$/.test(normalized)) return "CN";
  return "US";
}

function formatMarketShortLabel(market: "CN" | "HK" | "US") {
  if (market === "CN") return "A股";
  if (market === "HK") return "港股";
  return "美股";
}

function inferExchange(market: "CN" | "HK" | "US", code: string): string {
  const normalized = code.trim().toUpperCase();
  if (market === "HK") return "HK";
  if (market === "US") return "US";
  if (normalized.startsWith("SZ") || normalized.startsWith("00") || normalized.startsWith("30")) return "SZ";
  if (normalized.startsWith("BJ") || normalized.startsWith("8") || normalized.startsWith("4")) return "BJ";
  return "SH";
}

function upsertWatchlistStock(stock: ExtractedStock) {
  if (typeof window === "undefined") return;
  const code = stock.code.trim().toUpperCase();
  if (!code) return;
  const market = inferMarketFromCode(code);
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY_V2);
    const list = raw ? (JSON.parse(raw) as Array<{ market: string; symbol: string; name: string }>) : [];
    const key = `${market}.${code}`;
    const map = new Map<string, { market: string; symbol: string; name: string }>();
    for (const item of list) {
      if (!item || typeof item.symbol !== "string" || typeof item.market !== "string") continue;
      map.set(`${String(item.market).toUpperCase()}.${String(item.symbol).toUpperCase()}`, {
        market: String(item.market).toUpperCase(),
        symbol: String(item.symbol).toUpperCase(),
        name: String(item.name ?? item.symbol ?? "").trim() || String(item.symbol).toUpperCase(),
      });
    }
    map.set(key, { market, symbol: code, name: stock.name || code });
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY_V2, JSON.stringify(Array.from(map.values())));
  } catch {
    // Ignore localStorage failures.
  }
}

function loadWatchlistKeysFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY_V2);
    const list = raw ? (JSON.parse(raw) as Array<{ market?: string; symbol?: string }>) : [];
    const keys = new Set<string>();
    for (const item of list) {
      const market = String(item?.market ?? "").trim().toUpperCase();
      const symbol = String(item?.symbol ?? "").trim().toUpperCase();
      if (!market || !symbol) continue;
      keys.add(`${market}.${symbol}`);
    }
    return keys;
  } catch {
    return new Set();
  }
}

function shouldArchiveConversation(item: ConversationListItem) {
  return item.snapshot.messages.some((msg) => msg.role === "user");
}

function loadConversationArchiveFromStorage() {
  if (typeof window === "undefined") return [] as ConversationListItem[];
  try {
    const raw = window.localStorage.getItem(PICKER_ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConversationListItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
      .map((item) =>
        createConversationItem({
          id: item.id,
          title: item.title,
          messages: Array.isArray(item.snapshot?.messages) ? item.snapshot.messages : [],
          updatedAt: Number(item.updatedAt) || 0,
          script: item.snapshot?.script,
          dialogueMode: item.snapshot?.dialogueMode === "direct" ? "direct" : "prompt",
          preference_snapshot: item.snapshot?.preference_snapshot,
          conversation_phase: item.snapshot?.conversation_phase,
          candidate_stocks: item.snapshot?.candidate_stocks,
          suggested_actions: item.snapshot?.suggested_actions,
          confirmedPreferenceSlots: item.snapshot?.confirmedPreferenceSlots,
        }),
      );
  } catch {
    return [];
  }
}

function loadTitleOverridesFromStorage() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  try {
    const raw = window.localStorage.getItem(PICKER_TITLE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
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
  bottomInsetPx = 0,
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
  bottomInsetPx?: number;
}) {
  const hasSearch = searchValue.trim().length > 0;
  return (
    <section className={cn("flex min-h-0 flex-1 flex-col gap-2", className)} aria-label="对话历史列表">
      <div className="flex items-center gap-2">
        <InputGroup className="flex-1">
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
      </div>
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
        <ScrollArea className="min-h-0 flex-1 overscroll-contain pr-1">
          <ul
            className="flex flex-col gap-1"
            style={{
              paddingBottom:
                bottomInsetPx > 0 ? `calc(${Math.max(0, Math.round(bottomInsetPx))}px + env(safe-area-inset-bottom))` : 0,
            }}
            aria-label="会话条目"
          >
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

function ChatTimelineSection({
  chatViewportRef,
  chatScrollContentRef,
  chatBottomInsetPx,
  messages,
  conversationMode,
  onEditMessage,
  onDeleteMessage,
  sendPending,
  streamStatus,
  conversation_phase,
  candidate_stocks,
  onEnterAnalyze,
  onAddWatchlistStock,
  isInWatchlist,
  sendError,
  onRetrySend,
  onClearSendError,
  chatPinnedToBottom,
  onScrollToBottom,
  bottomAnchorRef,
  bottomAnchorOffsetPx,
  composerDesktopBounds,
}: {
  chatViewportRef: React.RefObject<HTMLDivElement | null>;
  chatScrollContentRef: React.RefObject<HTMLDivElement | null>;
  chatBottomInsetPx: number;
  messages: PickerMessage[];
  conversationMode: "consult" | "pick" | null;
  onEditMessage: (message: PickerMessage) => void;
  onDeleteMessage: (message: PickerMessage) => void;
  sendPending: boolean;
  streamStatus: "idle" | "connecting" | "streaming";
  conversation_phase: ConversationPhase;
  candidate_stocks: CandidateStock[];
  onEnterAnalyze: (code: string) => void;
  onAddWatchlistStock: (stock: { name: string; code: string }) => void;
  isInWatchlist: (code: string) => boolean;
  sendError: string | null;
  onRetrySend: () => void;
  onClearSendError: () => void;
  chatPinnedToBottom: boolean;
  onScrollToBottom: () => void;
  bottomAnchorRef: React.RefObject<HTMLDivElement | null>;
  bottomAnchorOffsetPx: number;
  composerDesktopBounds: { left?: number; width?: number };
}) {
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-3 px-1 pb-2 md:px-0 md:pb-0" aria-label="对话消息区域">
      <div className="relative h-full min-h-0 flex-1">
        <ScrollArea
          className="size-full overscroll-contain"
          ref={(root) => {
            chatViewportRef.current =
              root?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]') ?? null;
          }}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="选股对话消息"
        >
          <div
            ref={chatScrollContentRef}
            className="flex flex-col pr-1"
            style={{
              paddingBottom: `${chatBottomInsetPx}px`,
            }}
          >
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-2 pb-4 md:px-3 md:pb-6">
              {messages.length === 0 ? (
                <PickerChatEmpty mode={conversationMode} />
              ) : (
                messages.map((m) => (
                  <PickerChatMessage
                    key={m.id}
                    message={m}
                    anchorId={`pick-msg-item-${m.id}`}
                    onEditMessage={onEditMessage}
                    onDeleteMessage={onDeleteMessage}
                    onAnalyzeStock={onEnterAnalyze}
                    onAddWatchlistStock={onAddWatchlistStock}
                    isInWatchlist={isInWatchlist}
                    showPostStreamUi={!sendPending && streamStatus === "idle"}
                  />
                ))
              )}
              {conversationMode === "pick" && conversation_phase === "candidates_shown" && candidate_stocks.length > 0 ? (
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
                          <Button type="button" onClick={() => onEnterAnalyze(c.code)}>
                            进入择时
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {sendPending && streamStatus !== "idle" ? (
                <div className="text-muted-foreground flex items-center gap-2 px-1 py-1 text-xs" role="status">
                  <Spinner />
                  {streamStatus === "connecting" ? "正在连接对话服务..." : "正在生成回复..."}
                </div>
              ) : null}

              {sendError ? (
                <PageErrorState
                  title="消息发送失败"
                  description={sendError}
                  actions={
                    <>
                      <Button type="button" size="sm" variant="secondary" onClick={onRetrySend}>
                        重试发送
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={onClearSendError}>
                        关闭提示
                      </Button>
                    </>
                  }
                />
              ) : null}
              <div
                ref={bottomAnchorRef}
                aria-hidden
                className="h-px w-full"
                style={{ scrollMarginBottom: `${Math.max(0, Math.round(bottomAnchorOffsetPx))}px` }}
              />
            </div>
          </div>
        </ScrollArea>
        {!chatPinnedToBottom ? (
          <div
            className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
            style={{
              left: composerDesktopBounds.left !== undefined ? `${composerDesktopBounds.left}px` : undefined,
              width: composerDesktopBounds.width !== undefined ? `${composerDesktopBounds.width}px` : undefined,
              bottom: `${Math.max(12, Math.round(chatBottomInsetPx) + 12)}px`,
            }}
          >
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="pointer-events-auto rounded-full border-border/70 bg-background/90 shadow-md backdrop-blur supports-backdrop-filter:bg-background/75"
              onClick={onScrollToBottom}
              aria-label={sendPending ? "已暂停自动滚动，回到底部" : "回到底部"}
            >
              <ArrowDownIcon data-icon="inline-start" />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function PickPage() {
  const router = useRouter();
  const authSession = useAuthStore((s) => s.session);
  const sessionId = usePickerStore((s) => s.sessionId);
  const messages = usePickerStore((s) => s.messages);
  const dialogueMode = usePickerStore((s) => s.dialogueMode);
  const preference_snapshot = usePickerStore((s) => s.preference_snapshot);
  const conversation_phase = usePickerStore((s) => s.conversation_phase);
  const candidate_stocks = usePickerStore((s) => s.candidate_stocks);
  const suggested_actions = usePickerStore((s) => s.suggested_actions);
  const script = usePickerStore((s) => s.script);
  const streamingOptionsPending = usePickerStore((s) => s.streamingOptionsPending);
  const sendPending = usePickerStore((s) => s.sendPending);
  const streamStatus = usePickerStore((s) => s.streamStatus);
  const sendError = usePickerStore((s) => s.sendError);
  const clearSendError = usePickerStore((s) => s.clearSendError);
  const quotaBlocked = usePickerStore((s) => s.quotaBlocked);
  const clearQuotaBlocked = usePickerStore((s) => s.clearQuotaBlocked);
  const resetConversation = usePickerStore((s) => s.resetConversation);
  const sendUserText = usePickerStore((s) => s.sendUserText);
  const setDialogueMode = usePickerStore((s) => s.setDialogueMode);
  const removeMessage = usePickerStore((s) => s.removeMessage);
  const confirmedPreferenceSlots = usePickerStore((s) => s.confirmedPreferenceSlots);
  const analysisLoading = useAnalysisStore((s) => s.loading);
  const generateAnalysisReport = useAnalysisStore((s) => s.generateReport);
  const [draftBySession, setDraftBySession] = useState<Record<string, string>>({});
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isImeComposingRef = useRef(false);
  const mainAreaRef = useRef<HTMLElement | null>(null);
  const composerBarRef = useRef<HTMLElement | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const chatScrollContentRef = useRef<HTMLDivElement | null>(null);
  const chatBottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const chatPinnedToBottomRef = useRef(true);
  const autoScrollRafRef = useRef<number | null>(null);
  const [chatPinnedToBottom, setChatPinnedToBottom] = useState(true);
  const [composerDesktopBounds, setComposerDesktopBounds] = useState<{ left?: number; width?: number }>({});
  const [composerHeight, setComposerHeight] = useState(132);
  const [conversationArchive, setConversationArchive] = useState<ConversationListItem[]>(
    loadConversationArchiveFromStorage,
  );
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationTitleOverrides, setConversationTitleOverrides] = useState<Record<string, string>>(
    loadTitleOverridesFromStorage,
  );
  const [renameDraft, setRenameDraft] = useState("");
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<PickerMessage | null>(null);
  const [selectedSuggestedActionIds, setSelectedSuggestedActionIds] = useState<string[]>([]);
  const [extractedPanelOpen, setExtractedPanelOpen] = useState(false);
  const [analysisConfigOpen, setAnalysisConfigOpen] = useState(false);
  const [analysisQuotaOpen, setAnalysisQuotaOpen] = useState(false);
  const [analysisTargetStock, setAnalysisTargetStock] = useState<ExtractedStock | null>(null);
  const [optionsPanelVisible, setOptionsPanelVisible] = useState(true);
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(() => loadWatchlistKeysFromStorage());
  const activeSnapshotHydratedRef = useRef(false);
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
  const handleEditMessage = useCallback(
    (message: PickerMessage) => {
      if (message.role !== "user") return;
      if (sendError) clearSendError();
      setDraftForSession(message.content);
      queueMicrotask(() => {
        const el = draftTextareaRef.current;
        if (!el) return;
        el.focus();
        const cursor = el.value.length;
        el.setSelectionRange(cursor, cursor);
      });
    },
    [clearSendError, sendError, setDraftForSession],
  );

  const handleDeleteMessage = useCallback(
    (message: PickerMessage) => {
      setDeletingMessage(message);
    },
    [],
  );

  const confirmDeleteMessage = useCallback(() => {
    if (!deletingMessage) return;
    if (sendError) clearSendError();
    removeMessage(deletingMessage.id);
    setDeletingMessage(null);
    toast.success("消息已删除");
  }, [clearSendError, deletingMessage, removeMessage, sendError]);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior) => {
    const anchor = chatBottomAnchorRef.current;
    if (anchor) {
      anchor.scrollIntoView({ block: "end", behavior });
      return;
    }
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  }, []);

  const updatePinnedFromViewport = useCallback(() => {
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const distanceFromBottom = maxScroll - viewport.scrollTop;
    const threshold = 80;
    const pinned = distanceFromBottom <= threshold;
    if (chatPinnedToBottomRef.current !== pinned) {
      chatPinnedToBottomRef.current = pinned;
      setChatPinnedToBottom(pinned);
    }
  }, []);

  const scheduleAutoScrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (!chatPinnedToBottomRef.current) return;
      if (autoScrollRafRef.current !== null) return;
      autoScrollRafRef.current = requestAnimationFrame(() => {
        autoScrollRafRef.current = null;
        scrollChatToBottom(behavior);
        updatePinnedFromViewport();
      });
    },
    [scrollChatToBottom, updatePinnedFromViewport],
  );

  useLayoutEffect(() => {
    chatPinnedToBottomRef.current = chatPinnedToBottom;
  }, [chatPinnedToBottom]);

  useLayoutEffect(() => {
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("scroll", updatePinnedFromViewport, { passive: true });
    scheduleAutoScrollToBottom("auto");
    updatePinnedFromViewport();
    return () => {
      viewport.removeEventListener("scroll", updatePinnedFromViewport);
    };
  }, [scheduleAutoScrollToBottom, updatePinnedFromViewport]);

  useLayoutEffect(() => {
    if (!sendPending || streamStatus !== "streaming") return;
    chatPinnedToBottomRef.current = true;
    setChatPinnedToBottom(true);
    scheduleAutoScrollToBottom("auto");
  }, [messages, scheduleAutoScrollToBottom, sendPending, streamStatus]);

  useLayoutEffect(() => {
    const el = chatScrollContentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      scheduleAutoScrollToBottom("auto");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scheduleAutoScrollToBottom]);


  const conversationMode = dialogueMode === "direct" ? "consult" : "pick";
  const inputPlaceholder =
    dialogueMode === "direct" ? "直接提问市场、术语或工具使用方式" : "描述选股条件、风险偏好或持有周期";

  const toolbar_actions = useMemo(
    () => suggested_actions.filter((a) => a.action_id !== "intent_consult" && a.action_id !== "intent_pick"),
    [suggested_actions],
  );
  const orderedToolbarActions = useMemo(() => {
    return [...toolbar_actions].sort((a, b) => {
      const aActive = isActionActive(a.action_id, preference_snapshot);
      const bActive = isActionActive(b.action_id, preference_snapshot);
      if (aActive !== bActive) return aActive ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === "primary" ? -1 : 1;
      return a.label.localeCompare(b.label, "zh-CN");
    });
  }, [preference_snapshot, toolbar_actions]);
  const selectedSuggestedActions = useMemo(
    () => toolbar_actions.filter((a) => selectedSuggestedActionIds.includes(a.action_id)),
    [selectedSuggestedActionIds, toolbar_actions],
  );
  const currentConversationExtractedStocks = useMemo(() => {
    const byCode = new Map<string, ExtractedStock>();
    for (const stock of extractUniqueStocksFromMessages(messages)) {
      const normalizedCode = normalizeStockCode(stock.displayCode ?? stock.code);
      if (!normalizedCode) continue;
      byCode.set(normalizedCode.code, {
        ...stock,
        code: normalizedCode.code,
        displayCode: normalizedCode.displayCode,
      });
    }
    for (const candidate of candidate_stocks) {
      const normalized = normalizeStockCode(String(candidate.code ?? ""));
      const name = String(candidate.name ?? "").trim();
      if (!normalized) continue;
      if (!byCode.has(normalized.code)) {
        byCode.set(normalized.code, {
          code: normalized.code,
          displayCode: normalized.displayCode,
          name: name || normalized.displayCode,
        });
      }
    }
    return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code, "en"));
  }, [candidate_stocks, messages]);
  const analysisSymbolSearchItems = useMemo<AnalyzeSymbolSearchItem[]>(() => {
    const byKey = new Map<string, AnalyzeSymbolSearchItem>();
    for (const item of ANALYZE_SYMBOL_MOCK_UNIVERSE) byKey.set(item.key, item);
    const addStock = (stock: ExtractedStock) => {
      const code = stock.code.trim().toUpperCase();
      if (!code) return;
      const market = inferMarketFromCode(code);
      const key = `${market}.${code}`;
      byKey.set(key, { key, market, symbol: code, name: stock.name || code });
    };
    for (const stock of currentConversationExtractedStocks) addStock(stock);
    if (analysisTargetStock) addStock(analysisTargetStock);
    return Array.from(byKey.values());
  }, [analysisTargetStock, currentConversationExtractedStocks]);

  const openAnalysisConfig = useCallback((stock: ExtractedStock) => {
    setAnalysisTargetStock(stock);
    setAnalysisConfigOpen(true);
  }, []);

  const currentConversationItem = useMemo<ConversationListItem>(
    () =>
      createConversationItem({
        id: sessionId,
        title: conversationTitleOverrides[sessionId] ?? deriveConversationTitle(messages, script),
        messages,
        updatedAt: messages.at(-1)?.createdAt ?? messages.at(0)?.createdAt ?? 0,
        script,
        dialogueMode,
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
      dialogueMode,
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

  const deletingConversationItem = useMemo(
    () => conversationListItems.find((item) => item.id === deletingConversationId) ?? null,
    [conversationListItems, deletingConversationId],
  );
  const renameDraftTrimmed = renameDraft.trim();
  const chatBottomInsetPx = useMemo(() => {
    return composerHeight + (sendPending ? 96 : 20);
  }, [composerHeight, sendPending]);

  useLayoutEffect(() => {
    if (!chatPinnedToBottomRef.current) return;
    scheduleAutoScrollToBottom("auto");
  }, [chatBottomInsetPx, scheduleAutoScrollToBottom, streamStatus]);

  useEffect(
    () => () => {
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const measureBounds = () => {
      const main = mainAreaRef.current;
      if (!main) return;
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      if (!isDesktop) {
        setComposerDesktopBounds({});
        return;
      }
      const rect = main.getBoundingClientRect();
      const nextLeft = Math.round(rect.left);
      const nextWidth = Math.round(rect.width);
      setComposerDesktopBounds((prev) =>
        prev.left === nextLeft && prev.width === nextWidth ? prev : { left: nextLeft, width: nextWidth },
      );
    };

    measureBounds();
    const main = mainAreaRef.current;
    const ro =
      main && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measureBounds()) : null;
    if (ro && main) ro.observe(main);
    window.addEventListener("resize", measureBounds);
    window.addEventListener("scroll", measureBounds, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measureBounds);
      window.removeEventListener("scroll", measureBounds);
    };
  }, []);

  useEffect(() => {
    const composer = composerBarRef.current;
    if (!composer || typeof ResizeObserver === "undefined") return;
    const measureHeight = () => {
      const h = Math.ceil(composer.getBoundingClientRect().height);
      setComposerHeight((prev) => (prev === h ? prev : h));
    };
    measureHeight();
    const ro = new ResizeObserver(() => measureHeight());
    ro.observe(composer);
    return () => ro.disconnect();
  }, [draft, sendPending, streamingOptionsPending, toolbar_actions.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PICKER_ARCHIVE_STORAGE_KEY, JSON.stringify(conversationArchive));
    } catch {
      // Ignore localStorage failures.
    }
  }, [conversationArchive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PICKER_TITLE_STORAGE_KEY, JSON.stringify(conversationTitleOverrides));
    } catch {
      // Ignore localStorage failures.
    }
  }, [conversationTitleOverrides]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PICKER_ACTIVE_SESSION_STORAGE_KEY, sessionId);
    } catch {
      // Ignore localStorage failures.
    }
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeSnapshotHydratedRef.current) return;
    activeSnapshotHydratedRef.current = true;

    const rawSnapshot = window.localStorage.getItem(PICKER_ACTIVE_SNAPSHOT_STORAGE_KEY);
    if (rawSnapshot) {
      try {
        const snapshot = JSON.parse(rawSnapshot) as ConversationListItem["snapshot"];
        if (snapshot && Array.isArray(snapshot.messages) && typeof snapshot.sessionId === "string") {
          usePickerStore.setState({
            ...snapshot,
            sendPending: false,
            sendError: null,
            streamingOptionsPending: false,
            quotaBlocked: false,
            resumePrompt: false,
          });
          chatPinnedToBottomRef.current = true;
          setChatPinnedToBottom(true);
          return;
        }
      } catch {
        // Ignore invalid snapshot cache.
      }
    }

    const activeId = window.localStorage.getItem(PICKER_ACTIVE_SESSION_STORAGE_KEY);
    if (!activeId || activeId === sessionId) return;
    const target = conversationArchive.find((item) => item.id === activeId);
    if (!target) return;
    usePickerStore.setState({
      ...target.snapshot,
      sendPending: false,
      sendError: null,
      streamingOptionsPending: false,
      quotaBlocked: false,
      resumePrompt: false,
    });
    chatPinnedToBottomRef.current = true;
    setChatPinnedToBottom(true);
  }, [conversationArchive, sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PICKER_ACTIVE_SNAPSHOT_STORAGE_KEY,
        JSON.stringify({
          sessionId: currentConversationItem.snapshot.sessionId,
          script: currentConversationItem.snapshot.script,
          dialogueMode: currentConversationItem.snapshot.dialogueMode,
          messages: currentConversationItem.snapshot.messages,
          preference_snapshot: currentConversationItem.snapshot.preference_snapshot,
          conversation_phase: currentConversationItem.snapshot.conversation_phase,
          candidate_stocks: currentConversationItem.snapshot.candidate_stocks,
          suggested_actions: currentConversationItem.snapshot.suggested_actions,
          confirmedPreferenceSlots: currentConversationItem.snapshot.confirmedPreferenceSlots,
        }),
      );
    } catch {
      // Ignore localStorage failures.
    }
  }, [currentConversationItem]);

  useEffect(() => {
    if (!shouldArchiveConversation(currentConversationItem)) return;
    setConversationArchive((prev) => upsertConversationItem(prev, currentConversationItem));
  }, [currentConversationItem]);

  useEffect(() => {
    const validIds = new Set(toolbar_actions.map((action) => action.action_id));
    setSelectedSuggestedActionIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [toolbar_actions]);

  useEffect(() => {
    if (toolbar_actions.length > 0) {
      setOptionsPanelVisible(true);
    }
  }, [toolbar_actions]);

  useEffect(() => {
    if (authSession !== "user") {
      setWatchlistKeys(loadWatchlistKeysFromStorage());
      return;
    }
    let canceled = false;
    void requestStockPortfolio()
      .then((list) => {
        if (canceled) return;
        const keys = new Set<string>();
        for (const item of list) {
          keys.add(`${item.market}.${item.symbol.trim().toUpperCase()}`);
        }
        setWatchlistKeys(keys);
      })
      .catch(() => {
        if (canceled) return;
        setWatchlistKeys(loadWatchlistKeysFromStorage());
      });
    return () => {
      canceled = true;
    };
  }, [authSession]);

  const handleAddWatchlistStock = useCallback(
    (stock: ExtractedStock) => {
      const code = stock.code.trim().toUpperCase();
      if (!code) return;
      const market = inferMarketFromCode(code);
      const key = `${market}.${code}`;
      if (watchlistKeys.has(key)) return;

      if (authSession === "user") {
        void requestAddStockPortfolio({
          symbol: code,
          name: stock.name || code,
          market,
          exchange: inferExchange(market, code),
        })
          .then(() => {
            setWatchlistKeys((prev) => new Set(prev).add(key));
            toast.success("已加入自选");
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "加入自选失败";
            toast.error(message);
          });
        return;
      }

      upsertWatchlistStock(stock);
      setWatchlistKeys(loadWatchlistKeysFromStorage());
      toast.success("已加入自选");
    },
    [authSession, watchlistKeys],
  );

  const switchConversation = useCallback(
    (conversationId: string) => {
      if (conversationId === sessionId) return;
      const target = conversationListItems.find((item) => item.id === conversationId);
      if (!target) return;
      if (shouldArchiveConversation(currentConversationItem)) {
        setConversationArchive((prev) => upsertConversationItem(prev, currentConversationItem));
      }
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
    const nextTitle = renameDraftTrimmed;
    if (!targetId || !nextTitle) return;

    setConversationArchive((prev) =>
      prev.map((item) => (item.id === targetId ? { ...item, title: nextTitle } : item)),
    );
    setConversationTitleOverrides((prev) =>
      prev[targetId] === nextTitle ? prev : { ...prev, [targetId]: nextTitle },
    );
    setEditingConversationId(null);
  }, [editingConversationId, renameDraftTrimmed]);

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

  const handleSendSelectedSuggestedActions = async () => {
    if (sendPending || selectedSuggestedActions.length === 0) return;
    const payload = selectedSuggestedActions.map((action) => action.label.trim()).filter(Boolean).join("；");
    if (!payload) return;
    const ok = await sendUserText(payload);
    if (ok) {
      setSelectedSuggestedActionIds([]);
    }
  };

  const handleClearSuggestedSelection = useCallback(() => {
    if (selectedSuggestedActionIds.length > 0) {
      setSelectedSuggestedActionIds([]);
    }
  }, [selectedSuggestedActionIds.length]);

  const handleCloseSuggestedPanel = useCallback(() => {
    setOptionsPanelVisible(false);
  }, []);

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
      className="flex min-h-0 flex-1 flex-col overflow-hidden gap-0! p-0!"
      contentClassName="min-h-0 flex-1 gap-0 overflow-hidden"
    >
      <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-1">
        <aside
          className="flex h-full min-h-0 flex-col overflow-hidden border-b px-4 pt-4 pb-4 md:border-r md:border-b-0"
          aria-label="选股会话侧栏"
        >
          <ConversationListSection
            className="min-h-0"
            items={filteredConversationListItems}
            activeId={sessionId}
            onSelect={switchConversation}
            searchValue={conversationSearch}
            onSearchChange={setConversationSearch}
            onEditConversation={openRenameConversation}
            onDeleteConversation={(item) => setDeletingConversationId(item.id)}
            onNewConversation={() => {
              if (shouldArchiveConversation(currentConversationItem)) {
                setConversationArchive((prev) => upsertConversationItem(prev, currentConversationItem));
              }
              setConversationSearch("");
              resetConversation();
            }}
          />
        </aside>

        <main
          ref={mainAreaRef}
          className="relative isolate flex h-full min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatTimelineSection
              chatViewportRef={chatViewportRef}
              chatScrollContentRef={chatScrollContentRef}
              chatBottomInsetPx={chatBottomInsetPx}
              messages={messages}
              conversationMode={conversationMode}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              sendPending={sendPending}
              streamStatus={streamStatus}
              conversation_phase={conversation_phase}
              candidate_stocks={candidate_stocks}
              onEnterAnalyze={(code) => {
                const normalized = code.trim().toUpperCase();
                const stock =
                  currentConversationExtractedStocks.find((item) => item.code.trim().toUpperCase() === normalized) ??
                  { name: normalized, code: normalized };
                openAnalysisConfig(stock);
              }}
              onAddWatchlistStock={(stock) => {
                handleAddWatchlistStock(stock);
              }}
              isInWatchlist={(code) => {
                const market = inferMarketFromCode(code);
                return watchlistKeys.has(`${market}.${code.trim().toUpperCase()}`);
              }}
              sendError={sendError}
              onRetrySend={() => void handleSend()}
              onClearSendError={clearSendError}
              chatPinnedToBottom={chatPinnedToBottom}
              onScrollToBottom={() => {
                chatPinnedToBottomRef.current = true;
                setChatPinnedToBottom(true);
                scrollChatToBottom("smooth");
              }}
              bottomAnchorRef={chatBottomAnchorRef}
              bottomAnchorOffsetPx={chatBottomInsetPx + 24}
              composerDesktopBounds={composerDesktopBounds}
            />
          </div>

          <section
            ref={composerBarRef}
            style={{
              left: composerDesktopBounds.left !== undefined ? `${composerDesktopBounds.left}px` : undefined,
              width: composerDesktopBounds.width !== undefined ? `${composerDesktopBounds.width}px` : undefined,
            }}
            className="fixed inset-x-0 bottom-0 z-20 overflow-visible bg-background px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:px-3 md:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
            aria-label="消息输入区"
          >
          {currentConversationExtractedStocks.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-full">
              <div className="pointer-events-auto mx-auto w-full max-w-4xl px-3 md:px-2">
                <section aria-label="当前对话股票提取">
                  <Collapsible open={extractedPanelOpen} onOpenChange={setExtractedPanelOpen}>
                    <div className="overflow-hidden rounded-t-md rounded-b-none border-x border-t bg-background">
                      <CollapsibleTrigger className="group/stock-trigger flex w-full items-center justify-between gap-1.5 px-2 py-1 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                        <div className="flex min-w-0 items-center gap-1">
                          <TagsIcon className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/stock-trigger:text-foreground" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 text-xs font-medium leading-tight">
                              <span>识别股票</span>
                              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                {currentConversationExtractedStocks.length} 只
                              </Badge>
                            </p>
                          </div>
                        </div>
                        <ChevronDownIcon
                          className={cn(
                            "size-3.5 shrink-0 text-muted-foreground transition group-hover/stock-trigger:text-foreground",
                            extractedPanelOpen ? "rotate-180" : "",
                          )}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="bg-muted/10 px-2 py-2">
                        <ScrollArea className="h-52 min-h-0 pr-1">
                          <ItemGroup
                            className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
                            aria-label="当前对话提取股票列表"
                          >
                            {currentConversationExtractedStocks.map((stock) => (
                              (() => {
                                const market = inferMarketFromCode(stock.code);
                                const watchlistKey = `${market}.${stock.code.trim().toUpperCase()}`;
                                const alreadyInWatchlist = watchlistKeys.has(watchlistKey);
                                return (
                              <Item
                                key={stock.code}
                                size="xs"
                                variant="outline"
                                className="group/stock-item bg-background/80 transition-all hover:border-ring/40 hover:bg-background hover:shadow-sm"
                              >
                                <ItemHeader className="min-w-0">
                                  <ItemContent>
                                    <ItemTitle className="max-w-44 text-[11px] font-normal leading-tight sm:max-w-36">
                                      <span className="truncate">{`${stock.displayCode ?? stock.code}（${stock.name}）`}</span>
                                    </ItemTitle>
                                    <ItemDescription className="text-[10px] leading-tight">
                                      {formatMarketShortLabel(market)}
                                    </ItemDescription>
                                  </ItemContent>
                                  <ItemActions className="gap-1 opacity-0 transition-opacity group-hover/stock-item:opacity-100 group-focus-within/stock-item:opacity-100">
                                    <Tooltip>
                                      <TooltipTrigger
                                        render={
                                          <Button
                                            type="button"
                                            size="icon-xs"
                                            variant="outline"
                                            className="hover:bg-muted"
                                            aria-label={`分析 ${stock.name}`}
                                            onClick={() => openAnalysisConfig(stock)}
                                          >
                                            <TrendingUpIcon />
                                          </Button>
                                        }
                                      />
                                      <TooltipContent side="top" align="center">分析</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger
                                        render={
                                          <Button
                                            type="button"
                                            size="icon-xs"
                                            variant={alreadyInWatchlist ? "secondary" : "outline"}
                                            className="hover:bg-muted"
                                            disabled={alreadyInWatchlist}
                                            aria-label={alreadyInWatchlist ? "已在自选" : `将 ${stock.name} 加入自选`}
                                            onClick={() => {
                                              handleAddWatchlistStock(stock);
                                            }}
                                          >
                                            {alreadyInWatchlist ? <CheckIcon /> : <PlusIcon />}
                                          </Button>
                                        }
                                      />
                                      <TooltipContent side="top" align="center">
                                        {alreadyInWatchlist ? "已在自选" : "加入自选"}
                                      </TooltipContent>
                                    </Tooltip>
                                  </ItemActions>
                                </ItemHeader>
                              </Item>
                                );
                              })()
                            ))}
                          </ItemGroup>
                        </ScrollArea>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </section>
              </div>
            </div>
          ) : null}
          <div className="mx-auto w-full max-w-4xl">
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
                ) : toolbar_actions.length > 0 && optionsPanelVisible ? (
                  <div className="rounded-lg border p-1">
                    <ul className="flex flex-col gap-0.5" aria-label="建议操作多选列表">
                      {orderedToolbarActions.map((a) => {
                        const selected = selectedSuggestedActionIds.includes(a.action_id);
                        return (
                          <li key={a.action_id}>
                            <Button
                              type="button"
                              size="sm"
                              variant={selected ? "secondary" : "ghost"}
                              className={cn(
                                "h-7 w-full justify-start px-2 text-left text-xs",
                              )}
                              aria-label={`建议操作：${a.label}`}
                              disabled={sendPending}
                              onClick={() => {
                                setSelectedSuggestedActionIds((prev) =>
                                  prev.includes(a.action_id)
                                    ? prev.filter((id) => id !== a.action_id)
                                    : [...prev, a.action_id],
                                );
                              }}
                            >
                              {selected ? <CheckIcon data-icon="inline-start" /> : null}
                              <SuggestedActionMarkdown content={a.label} />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-1 ml-auto flex items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="outline"
                              disabled={sendPending || selectedSuggestedActionIds.length === 0}
                              onClick={handleClearSuggestedSelection}
                              aria-label="清空已选建议"
                            >
                              <Trash2Icon />
                            </Button>
                          }
                        />
                        <TooltipContent side="top" align="end">清空</TooltipContent>
                      </Tooltip>
                      <Button
                        type="button"
                        size="xs"
                        variant="default"
                        disabled={sendPending || selectedSuggestedActions.length === 0}
                        onClick={() => void handleSendSelectedSuggestedActions()}
                      >
                        发送所选{selectedSuggestedActions.length > 0 ? ` (${selectedSuggestedActions.length})` : ""}
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        disabled={sendPending}
                        onClick={handleCloseSuggestedPanel}
                        aria-label="关闭建议操作面板"
                      >
                        <ChevronDownIcon />
                      </Button>
                    </div>
                  </div>
                ) : null}

                <InputGroup
                  data-disabled={sendPending ? "true" : undefined}
                  className="h-auto has-disabled:bg-background has-disabled:opacity-100"
                >
                  <InputGroupTextarea
                    ref={draftTextareaRef}
                    id="pick-input"
                    value={draft}
                    placeholder={inputPlaceholder}
                    disabled={sendPending}
                    aria-invalid={sendError ? true : undefined}
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
                    className="justify-between gap-1.5 group-data-[disabled=true]/input-group:opacity-100"
                  >
                    <Select
                      value={conversationMode}
                      onValueChange={(v) => {
                        if (!v || sendPending || streamingOptionsPending) return;
                        if (v === "consult") setDialogueMode("direct");
                        if (v === "pick") setDialogueMode("prompt");
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label="对话模式"
                        disabled={sendPending || streamingOptionsPending}
                      >
                        {(() => {
                          const mode = conversationMode;
                          const Icon = conversationModeIcons[mode];
                          return (
                            <div className="flex items-center gap-1.5">
                              <Icon className="text-muted-foreground size-3.5" />
                              <SelectValue>{conversationModeLabels[mode]}</SelectValue>
                            </div>
                          );
                        })()}
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
                            className="rounded-full"
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
          </div>
          </section>
        </main>
      </div>

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
            <Button type="button" onClick={() => router.push("/app/account/subscription")}>
              {subscriptionTierPublicCopy.ctaViewPlansShort}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AnalyzeRunConfigDialog
        open={analysisConfigOpen}
        onOpenChange={(open) => {
          setAnalysisConfigOpen(open);
          if (!open && !analysisLoading) setAnalysisTargetStock(null);
        }}
        loading={analysisLoading}
        symbolSearchItems={analysisSymbolSearchItems}
        searchKeyword={
          analysisTargetStock
            ? `${inferMarketFromCode(analysisTargetStock.code)}.${analysisTargetStock.code.trim().toUpperCase()}`
            : ""
        }
        market={analysisTargetStock ? inferMarketFromCode(analysisTargetStock.code) : preference_snapshot.market}
        riskTier={preference_snapshot.risk_tier}
        holdingHorizon={preference_snapshot.holding_horizon}
        linkedPreference={preference_snapshot}
        onConfirm={async ({ input }) => {
          const ok = await generateAnalysisReport(input);
          if (ok) {
            setAnalysisConfigOpen(false);
            setAnalysisTargetStock(null);
            router.push(`/app/analyze?stockCode=${encodeURIComponent(`${input.market}.${input.symbol}`)}`);
            return true;
          }
          if (useAnalysisStore.getState().error === "quota") {
            setAnalysisConfigOpen(false);
            setAnalysisTargetStock(null);
            setAnalysisQuotaOpen(true);
          } else {
            toast.error("分析生成失败，请调整参数后重试。");
          }
          return false;
        }}
      />

      <AlertDialog open={analysisQuotaOpen} onOpenChange={setAnalysisQuotaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>今日额度已用完</AlertDialogTitle>
            <AlertDialogDescription>{analyzeCopy.quotaDialogBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>关闭</AlertDialogCancel>
            <Button type="button" variant="secondary" onClick={() => router.push("/app/account/subscription")}>
              {subscriptionTierPublicCopy.ctaViewPlansShort}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(editingConversationId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingConversationId(null);
            setRenameDraft("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑会话标题</DialogTitle>
            <DialogDescription>修改后会在左侧会话列表实时更新，建议使用简短关键词。</DialogDescription>
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
                autoFocus
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  submitRenameConversation();
                }}
              />
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                {renameDraft.length}/40
              </p>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingConversationId(null)}>
              取消
            </Button>
            <Button type="button" onClick={submitRenameConversation} disabled={!renameDraftTrimmed}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deletingMessage)}
        onOpenChange={(open) => {
          if (!open) setDeletingMessage(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条消息？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后会从当前对话中移除，并同步更新本地会话记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteMessage}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deletingConversationId)}
        onOpenChange={(open) => {
          if (!open) setDeletingConversationId(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingConversationItem
                ? `将永久删除「${deletingConversationItem.title}」，删除后无法恢复。`
                : "删除后无法恢复，确认继续吗？"}
            </AlertDialogDescription>
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
