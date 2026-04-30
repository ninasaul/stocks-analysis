"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CircleHelpIcon,
  EyeIcon,
  FolderDownIcon,
  FileDownIcon,
  FileTextIcon,
  GlobeIcon,
  HistoryIcon,
  MapPinIcon,
  RotateCwIcon,
  TargetIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { AnalysisInput, PreferenceSnapshot, TimingReport } from "@/lib/contracts/domain";
import {
  ANALYZE_SYMBOL_MOCK_UNIVERSE,
  formatAnalyzeBoardSymbol,
  fuzzyAnalyzeSymbolScore,
  parseAnalyzeSearchInput,
  type AnalyzeSymbolSearchItem,
} from "@/lib/analyze-symbol-search";
import { requestStockQuote, requestStockSearch, type StockQuote } from "@/lib/api/stocks";
import { requestAnalyzeHistory, requestReportFile } from "@/lib/api/timing";
import { hashCode } from "@/lib/mock-base-quote";
import { analyzeCopy, subscriptionTierPublicCopy } from "@/lib/copy";
import { useAnalysisStore } from "@/stores/use-analysis-store";
import { useArchiveStore } from "@/stores/use-archive-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useNotificationPreferencesStore } from "@/stores/use-notification-preferences-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AnalyzeRunConfigDialog } from "@/components/features/analyze-run-config-dialog";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageEmptyState, PageErrorState, PageLoadingState } from "@/components/features/page-state";
import { StockSearchCombobox } from "@/components/features/stock-search-combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";

const actionLabels: Record<string, string> = {
  wait: "观望",
  trial: "试仓",
  add: "加仓",
  reduce: "减仓",
  exit: "离场",
};

const actionBadgeClassNames: Record<string, string> = {
  wait:
    "border-transparent bg-muted text-muted-foreground dark:bg-muted/70 dark:text-muted-foreground",
  trial:
    "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  add:
    "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  reduce:
    "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  exit:
    "border-transparent bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

const riskTierLabels: Record<AnalysisInput["risk_tier"], string> = {
  conservative: "保守",
  balanced: "平衡",
  aggressive: "进取",
};

const holdingLabels: Record<AnalysisInput["holding_horizon"], string> = {
  intraday_to_days: "日内至数日",
  w1_to_w4: "1～4 周",
  m1_to_m3: "1～3 个月",
  m3_plus: "3 个月以上",
};

const styleLabels: Record<PreferenceSnapshot["style"], string> = {
  value: "价值",
  growth: "成长",
  momentum: "动量/趋势",
  no_preference: "无明确风格偏好",
};

function resolveAnalyzeListPrimaryName(
  report: TimingReport | null,
  market: AnalysisInput["market"],
  symbol: string,
  searchName?: string,
): string {
  const si = report?.stock_info;
  const rawName = typeof si?.name === "string" ? si.name.trim() : "";
  if (rawName) return rawName;
  const code = typeof si?.code === "string" ? si.code.trim().toUpperCase() : "";
  if (code) return code;
  if (searchName?.trim()) return searchName.trim();
  return formatAnalyzeBoardSymbol(market, symbol);
}

function resolveAnalyzeListDetailLine(
  report: TimingReport | null,
  market: AnalysisInput["market"],
  symbol: string,
): string {
  const si = report?.stock_info;
  if (si) {
    const exch = typeof si.exchange === "string" ? si.exchange.trim() : "";
    const mkt = typeof si.market === "string" ? si.market.trim() : "";
    const code =
      typeof si.code === "string" && si.code.trim().length > 0
        ? si.code.trim().toUpperCase()
        : symbol.trim().toUpperCase();
    const parts = [exch, mkt, code].filter((x) => x.length > 0);
    if (parts.length > 0) return parts.join(" · ");
  }
  return formatAnalyzeBoardSymbol(market, symbol);
}

type SearchItem = AnalyzeSymbolSearchItem;

type AnalysisListItem = {
  id: string;
  market: AnalysisInput["market"];
  symbol: string;
  status: "done" | "running";
};

type BasicQuote = {
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  updatedAt: number;
};

type FactItem = {
  label: string;
  value: string;
  tone?: "up" | "down" | "neutral";
};

type TargetPriceRow = {
  horizon: string;
  range: string;
  target: string;
  rationale: string;
};

type QuoteViewStatus = "idle" | "cached" | "live" | "error";

const LOCAL_ANALYSIS_ACTIVE_ID_KEY = "zhputian-analysis-active-id-v1";
const sentimentChartConfig = {
  score: { label: "指数", color: "var(--chart-2)" },
} as const;

function preferenceSummary(p: PreferenceSnapshot) {
  const m = p.market === "CN" ? "A 股" : p.market === "HK" ? "港股" : "美股";
  const sec =
    p.sector_mode === "specified" && p.sectors.length ? p.sectors.join("、") : "行业不限制";
  return `${m}；${sec}；持有周期 ${holdingLabels[p.holding_horizon]}；风格 ${styleLabels[p.style]}；风险 ${riskTierLabels[p.risk_tier]}`;
}

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button type="button" variant="ghost" size="icon-xs" aria-label={label}>
            <CircleHelpIcon />
          </Button>
        }
      />
      <TooltipContent side="bottom" align="start">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

type AnalysisHistoryRunningRow = {
  id: string;
  market: AnalysisInput["market"];
  symbol: string;
  name: string;
  /** 取自 stock_info（交易所 · 市场 · 代码）；无则用板块代码格式 */
  detailLine: string;
};

type AnalysisHistoryDoneRow = AnalysisHistoryRunningRow & {
  report: TimingReport | null;
};

function AnalysisHistoryList({
  running,
  done,
  activeAnalysisId,
  onSelect,
}: {
  running: AnalysisHistoryRunningRow[];
  done: AnalysisHistoryDoneRow[];
  activeAnalysisId: string | null;
  onSelect: (item: { id: string; market: AnalysisInput["market"]; symbol: string }) => void;
}) {
  return (
    <ItemGroup className="gap-1">
      {running.length ? (
        <>
          {running.map((item) => (
            <Item
              key={item.id}
              size="xs"
              variant={activeAnalysisId === item.id ? "muted" : "default"}
              className="items-start"
              render={
                <button type="button" />
              }
              onClick={() => onSelect({ id: item.id, market: item.market, symbol: item.symbol })}
            >
              <ItemContent className="min-w-0 gap-0.5">
                <ItemTitle className="w-full truncate leading-5">{item.name}</ItemTitle>
                <ItemDescription className="text-muted-foreground line-clamp-2 text-xs leading-4 whitespace-normal wrap-break-word">
                  {item.detailLine}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="pt-0.5">
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  分析中
                </Badge>
              </ItemActions>
            </Item>
          ))}
          <ItemSeparator className="my-0.5" />
        </>
      ) : null}

      {done.map((item) => {
        const action = item.report ? actionLabels[item.report.action] ?? item.report.action : "已完成";
        const actionTone = item.report
          ? actionBadgeClassNames[item.report.action] ?? actionBadgeClassNames.wait
          : actionBadgeClassNames.wait;
        return (
          <Item
            key={item.id}
            size="xs"
            variant={activeAnalysisId === item.id ? "muted" : "default"}
            className="items-start"
            render={
              <button type="button" />
            }
            onClick={() => onSelect({ id: item.id, market: item.market, symbol: item.symbol })}
          >
            <ItemContent className="min-w-0 gap-0.5">
              <ItemTitle className="w-full truncate leading-5">{item.name}</ItemTitle>
              <ItemDescription className="text-muted-foreground line-clamp-2 text-xs leading-4 whitespace-normal wrap-break-word">
                {item.detailLine}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="pt-0.5">
              <Badge variant="outline" className={`${actionTone} h-5 px-1.5 text-[11px]`}>
                {action}
              </Badge>
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

const parseSearchInput = parseAnalyzeSearchInput;

function parseStockCodeParam(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.match(/^(CN|HK|US)\.(.+)$/i);
  if (prefixed) {
    return {
      market: prefixed[1].toUpperCase() as AnalysisInput["market"],
      symbol: prefixed[2].trim(),
    };
  }
  return { market: null, symbol: trimmed };
}

const fuzzySearchScore = fuzzyAnalyzeSymbolScore;

function toBasicQuote(quote: StockQuote): BasicQuote {
  return {
    price: quote.currentPrice,
    change: quote.change,
    changePct: quote.changePercent,
    open: quote.open ?? quote.currentPrice,
    high: quote.high ?? quote.currentPrice,
    low: quote.low ?? quote.currentPrice,
    volume: quote.volume ?? 0,
    turnover: quote.amount ?? 0,
    updatedAt: quote.cachedAt,
  };
}

function formatAmount(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(2)} 万`;
  return value.toLocaleString("zh-CN");
}

function extractNumbers(text: string) {
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((item) => Number(item)).filter((n) => Number.isFinite(n));
}

function getTechnicalSignal(score: number) {
  if (score >= 48) return "强势延续";
  if (score >= 38) return "偏强震荡";
  if (score >= 28) return "中性拉锯";
  if (score >= 18) return "弱势回落";
  return "空头主导";
}

function getSentimentLabel(index: number) {
  if (index >= 75) return "贪婪";
  if (index >= 55) return "乐观";
  if (index >= 45) return "中性";
  if (index >= 25) return "谨慎";
  return "恐惧";
}

function getCurrencyLabel(market: AnalysisInput["market"]) {
  if (market === "HK") return "HK$";
  if (market === "US") return "US$";
  return "CNY";
}

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "--";
  return value.toFixed(2);
}

function formatPriceRange(low: number | null, high: number | null) {
  if (low === null || high === null || !Number.isFinite(low) || !Number.isFinite(high)) return "--";
  const min = Math.min(low, high);
  const max = Math.max(low, high);
  return `${min.toFixed(2)} - ${max.toFixed(2)}`;
}

function buildBasicFacts(market: AnalysisInput["market"], symbol: string, quote: BasicQuote | null): FactItem[] {
  if (market === "HK" && symbol === "00700") {
    return [
      { label: "昨收", value: "499.0" },
      { label: "今开", value: "506.5" },
      { label: "最高 / 最低", value: "516.0 / 504.0" },
      { label: "成交量", value: "2036.42万股" },
      { label: "成交额", value: "104.07亿" },
      { label: "换手率", value: "0.22%" },
      { label: "振幅", value: "2.40%" },
      { label: "52周区间", value: "440.2 ~ 683.0" },
      { label: "市盈率(TTM)", value: "18.89" },
      { label: "市净率", value: "3.59" },
      { label: "每股收益", value: "27.43" },
      { label: "每股净资产", value: "144.29" },
      { label: "总股本", value: "91.26亿" },
      { label: "总市值", value: "4.73万亿" },
    ];
  }

  const seed = hashCode(`${market}.${symbol}`);
  const fallbackPe = (14 + (seed % 900) / 100).toFixed(2);
  const fallbackPb = (1.2 + (seed % 260) / 100).toFixed(2);
  const eps = (1.6 + (seed % 1200) / 100).toFixed(2);
  const bps = (8 + (seed % 4000) / 100).toFixed(2);
  const turnover = (0.08 + (seed % 150) / 100).toFixed(2);
  const amp = (1.2 + (seed % 260) / 100).toFixed(2);
  const wkLow = quote ? (quote.price * 0.78).toFixed(2) : (80 + (seed % 200)).toFixed(2);
  const wkHigh = quote ? (quote.price * 1.22).toFixed(2) : (130 + (seed % 250)).toFixed(2);

  return [
    { label: "昨收", value: quote ? (quote.price - quote.change).toFixed(2) : "--" },
    { label: "今开", value: quote ? quote.open.toFixed(2) : "--" },
    { label: "最高 / 最低", value: quote ? `${quote.high.toFixed(2)} / ${quote.low.toFixed(2)}` : "--" },
    { label: "成交量", value: quote ? formatAmount(quote.volume) : "--" },
    { label: "成交额", value: quote ? formatAmount(quote.turnover) : "--" },
    { label: "换手率", value: `${turnover}%` },
    { label: "振幅", value: `${amp}%` },
    { label: "52周区间", value: `${wkLow} ~ ${wkHigh}` },
    { label: "市盈率(TTM)", value: fallbackPe },
    { label: "市净率", value: fallbackPb },
    { label: "每股收益", value: eps },
    { label: "每股净资产", value: bps },
  ];
}

function buildSentimentRadarData(index: number) {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return [
    { metric: "风险偏好", score: clamp(index + 6) },
    { metric: "趋势乐观", score: clamp(index + 2) },
    { metric: "波动承受", score: clamp(index - 4) },
    { metric: "流动性信心", score: clamp(index + 3) },
    { metric: "估值容忍", score: clamp(index - 1) },
  ];
}

function buildMarkdownFromReport(r: TimingReport) {
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
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildHtmlFromReport(r: TimingReport) {
  const title = `择时报告 ${r.market}.${r.symbol}`;
  const items = (xs: string[]) => xs.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const conflicts = (r.evidence_conflicts ?? []).map((x) => `冲突：${x}`);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";line-height:1.6;color:#0f172a;margin:0}
      main{max-width:960px;margin:0 auto;padding:32px 20px}
      h1{font-size:20px;margin:0 0 16px}
      h2{font-size:16px;margin:22px 0 10px}
      h3{font-size:14px;margin:14px 0 8px}
      .meta{color:#64748b;font-size:12px;margin-top:6px}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .card{border:1px solid #e2e8f0;border-radius:12px;padding:12px}
      ul{margin:8px 0 0;padding-left:18px}
      code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">data_version: ${escapeHtml(r.data_version)}</div>

      <h2>结论</h2>
      <div class="grid">
        <div class="card"><div class="meta">建议操作</div><div>${escapeHtml(actionLabels[r.action] ?? r.action)}</div></div>
        <div class="card"><div class="meta">综合得分</div><div>${escapeHtml(String(r.score_breakdown.total))}</div></div>
        <div class="card"><div class="meta">置信度</div><div>${escapeHtml(String(r.confidence))}</div></div>
        <div class="card"><div class="meta">风险等级</div><div>${escapeHtml(String(r.risk_level))}</div></div>
      </div>

      <h2>评分分解（60/25/15）</h2>
      <ul>
        <li>技术：${escapeHtml(String(r.score_breakdown.technical))}</li>
        <li>结构与风险：${escapeHtml(String(r.score_breakdown.structure_risk))}</li>
        <li>事件折扣：${escapeHtml(String(r.score_breakdown.event_discount))}</li>
      </ul>

      <h2>研究计划</h2>
      <ul>
        <li>关注区间：${escapeHtml(r.plan.focus_range)}</li>
        <li>风险位：${escapeHtml(r.plan.risk_level_price)}</li>
        <li>观察目标位：${escapeHtml(r.plan.target_price)}</li>
        <li>风险敞口：${escapeHtml(r.plan.risk_exposure_pct)}</li>
        <li>失效条件：${escapeHtml(r.plan.invalidation)}</li>
        <li>有效期：${escapeHtml(r.plan.valid_until)}</li>
      </ul>

      <h2>依据</h2>
      <h3>正向</h3>
      <ul>${items(r.evidence_positive)}</ul>
      <h3>负向与冲突</h3>
      <ul>${items([...r.evidence_negative, ...conflicts])}</ul>

      <h2>提醒</h2>
      <ul>${items(r.reminders)}</ul>
    </main>
  </body>
</html>`;
}

function AnalyzeHistorySkeleton() {
  return (
    <div className="flex flex-col gap-2 p-1" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={`history-skeleton-${idx}`} className="rounded-md border p-2.5">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="mt-2 h-3.5 w-2/5" />
          <Skeleton className="mt-2 h-3.5 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function AnalyzeReportSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4" aria-hidden="true">
      <Skeleton className="h-6 w-60 max-w-full" />
      <div className="grid gap-2 sm:grid-cols-3">
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
      </div>
      <Skeleton className="h-40 rounded-md" />
      <Skeleton className="h-48 rounded-md" />
    </div>
  );
}

function AnalyzePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const archives = useArchiveStore((s) => s.archives);
  const archiveHydrated = useStoreHydrated(useArchiveStore);
  const pendingHandoff = useAnalysisStore((s) => s.pendingHandoff);
  const setPendingHandoff = useAnalysisStore((s) => s.setPendingHandoff);
  const report = useAnalysisStore((s) => s.report);
  const loading = useAnalysisStore((s) => s.loading);
  const progress = useAnalysisStore((s) => s.progress);
  const generateReport = useAnalysisStore((s) => s.generateReport);
  const buildMarkdown = useAnalysisStore((s) => s.buildMarkdown);
  const currentInput = useAnalysisStore((s) => s.currentInput);
  const error = useAnalysisStore((s) => s.error);
  const authSession = useAuthStore((s) => s.session);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [market, setMarket] = useState<AnalysisInput["market"]>("CN");
  const [riskTier, setRiskTier] = useState<AnalysisInput["risk_tier"]>("balanced");
  const [holdingHorizon, setHoldingHorizon] = useState<AnalysisInput["holding_horizon"]>("m1_to_m3");
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [linkedPreference, setLinkedPreference] = useState<PreferenceSnapshot | null>(null);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [localHistoryLoaded, setLocalHistoryLoaded] = useState(false);
  const [localHistory, setLocalHistory] = useState<TimingReport[]>([]);
  const [liveQuote, setLiveQuote] = useState<BasicQuote | null>(null);
  const [quoteViewStatus, setQuoteViewStatus] = useState<QuoteViewStatus>("idle");
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [selectedSearchKey, setSelectedSearchKey] = useState<string | null>(null);
  const [searchComboboxOpen, setSearchComboboxOpen] = useState(false);
  const [remoteSearching, setRemoteSearching] = useState(false);
  const [remoteSearchItems, setRemoteSearchItems] = useState<SearchItem[]>([]);
  const analyzeReportScrollRef = useRef<HTMLDivElement | null>(null);
  const stockCodeParam = searchParams.get("stockCode");

  useEffect(() => {
    let canceled = false;
    setLocalHistoryLoaded(false);
    void requestAnalyzeHistory()
      .then((items) => {
        if (!canceled) setLocalHistory(items.slice(0, 100));
      })
      .catch(() => {
        if (!canceled) setLocalHistory([]);
      })
      .finally(() => {
        if (!canceled) setLocalHistoryLoaded(true);
      });
    return () => {
      canceled = true;
    };
  }, [authSession]);

  useEffect(() => {
    if (!localHistoryLoaded || !report) return;
    setLocalHistory((prev) => {
      return [report, ...prev.filter((x) => x.id !== report.id)].slice(0, 100);
    });
  }, [localHistoryLoaded, report]);

  const recentKeys = useMemo(() => {
    const keys: string[] = [];
    if (currentInput?.symbol) keys.push(`${currentInput.market}.${currentInput.symbol}`);
    if (report?.symbol) keys.push(`${report.market}.${report.symbol}`);
    for (const a of archives) {
      const k = `${a.market}.${a.symbol}`;
      if (!keys.includes(k)) keys.push(k);
      if (keys.length >= 16) break;
    }
    return keys;
  }, [archives, currentInput, report]);

  const searchItems = useMemo(() => {
    const byKey = new Map<string, SearchItem>();
    for (const m of ANALYZE_SYMBOL_MOCK_UNIVERSE) byKey.set(m.key, m);
    for (const item of remoteSearchItems) byKey.set(item.key, item);
    if (archiveHydrated) {
      for (const k of recentKeys) {
        if (byKey.has(k)) continue;
        const [mk, sym] = k.split(".") as [AnalysisInput["market"], string];
        if (mk && sym) {
          byKey.set(k, {
            key: k,
            market: mk,
            symbol: sym,
            name: formatAnalyzeBoardSymbol(mk, sym),
          });
        }
      }
    }
    const list = Array.from(byKey.values());
    list.sort((a, b) => {
      const ia = recentKeys.indexOf(a.key);
      const ib = recentKeys.indexOf(b.key);
      if (ia === -1 && ib === -1) return a.key.localeCompare(b.key);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return list;
  }, [archiveHydrated, recentKeys, remoteSearchItems]);

  const filteredSearchItems = useMemo(() => {
    const query = searchKeyword.trim().toLowerCase();
    if (!query) {
      return searchItems.slice(0, 10);
    }
    return searchItems
      .map((item, index) => ({
        item,
        recentRank: index,
        score: fuzzySearchScore(item, query),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.recentRank - b.recentRank;
      })
      .slice(0, 12)
      .map((entry) => entry.item);
  }, [searchItems, searchKeyword]);

  const selectedSearchItemByKey = useMemo(() => {
    if (!selectedSearchKey) return null;
    return searchItems.find((item) => item.key === selectedSearchKey) ?? null;
  }, [searchItems, selectedSearchKey]);

  const selectedSearchItem = useMemo(() => {
    if (selectedSearchItemByKey) return selectedSearchItemByKey;
    const parsed = parseSearchInput(searchKeyword, market);
    if (!parsed?.symbol) return null;
    const selectedKey = `${parsed.market}.${parsed.symbol}`.toLowerCase();
    return searchItems.find((item) => item.key.toLowerCase() === selectedKey) ?? null;
  }, [market, searchItems, searchKeyword, selectedSearchItemByKey]);

  const selectedInput = useMemo(() => {
    if (selectedSearchItem) {
      return { market: selectedSearchItem.market, symbol: selectedSearchItem.symbol };
    }
    return parseSearchInput(searchKeyword, market);
  }, [market, searchKeyword, selectedSearchItem]);

  const searchItemNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of searchItems) {
      map.set(item.key, item.name);
    }
    return map;
  }, [searchItems]);

  const analysisEntries = useMemo(() => {
    const list: TimingReport[] = [];
    if (report) list.push(report);
    for (const item of localHistory) {
      if (!list.some((x) => x.id === item.id)) list.push(item);
    }
    for (const a of archives) {
      if (!list.some((x) => x.id === a.id)) list.push(a);
    }
    return list;
  }, [archives, localHistory, report]);

  const analysisListItems = useMemo(() => {
    const list: AnalysisListItem[] = analysisEntries.map((item) => ({
      id: item.id,
      market: item.market,
      symbol: item.symbol,
      status: "done",
    }));
    if (loading) {
      const parsed = selectedInput;
      if (parsed?.symbol) {
        const key = `${parsed.market}.${parsed.symbol}`;
        const exists = list.some((x) => `${x.market}.${x.symbol}` === key);
        if (!exists) {
          list.unshift({
            id: `running-${key}`,
            market: parsed.market,
            symbol: parsed.symbol,
            status: "running",
          });
        }
      }
    }
    return list;
  }, [analysisEntries, loading, selectedInput]);

  const analysisListDisplay = useMemo(() => {
    const byKey = new Map<string, TimingReport>();
    for (const entry of analysisEntries) {
      const key = `${entry.market}.${entry.symbol}`;
      const existing = byKey.get(key);
      if (!existing || entry.created_at > existing.created_at) byKey.set(key, entry);
    }
    const display = analysisListItems.map((item) => {
      const key = `${item.market}.${item.symbol}`;
      const report = byKey.get(key) ?? null;
      const searchFallback = searchItemNameByKey.get(key);
      const name = resolveAnalyzeListPrimaryName(
        report,
        item.market,
        item.symbol,
        searchFallback,
      );
      const detailLine = resolveAnalyzeListDetailLine(report, item.market, item.symbol);
      return { ...item, key, report, name, detailLine };
    });
    const running = display.filter((x) => x.status === "running");
    const done = display.filter((x) => x.status === "done");
    done.sort((a, b) => (b.report?.created_at ?? 0) - (a.report?.created_at ?? 0));
    return { running, done };
  }, [analysisEntries, analysisListItems, searchItemNameByKey]);

  const stockCodeKey = useMemo(() => {
    if (!stockCodeParam) return null;
    const parsed = parseStockCodeParam(stockCodeParam);
    if (!parsed?.symbol) return null;
    if (parsed.market) return `${parsed.market}.${parsed.symbol}`;
    const matched = analysisListItems.find(
      (item) => item.symbol.toLowerCase() === parsed.symbol.toLowerCase(),
    );
    return matched ? `${matched.market}.${matched.symbol}` : null;
  }, [analysisListItems, stockCodeParam]);

  const updateStockCodeParam = useCallback(
    (code: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("stockCode", code);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const focusReportPanel = useCallback(() => {
    requestAnimationFrame(() => {
      analyzeReportScrollRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const selectAnalysisFromHistory = useCallback(
    (item: { id: string; market: AnalysisInput["market"]; symbol: string }) => {
      setActiveAnalysisId(item.id);
      setMarket(item.market);
      updateStockCodeParam(`${item.market}.${item.symbol}`);
      focusReportPanel();
    },
    [focusReportPanel, updateStockCodeParam],
  );

  useEffect(() => {
    if (!localHistoryLoaded) return;
    if (!analysisListItems.length) {
      setActiveAnalysisId(null);
      return;
    }
    setActiveAnalysisId((prev) => {
      if (stockCodeKey) {
        const matched = analysisListItems.find((item) => `${item.market}.${item.symbol}` === stockCodeKey);
        if (matched) return matched.id;
      }
      if (prev && analysisListItems.some((x) => x.id === prev)) return prev;
      const saved = localStorage.getItem(LOCAL_ANALYSIS_ACTIVE_ID_KEY);
      if (saved && analysisListItems.some((x) => x.id === saved)) return saved;
      return analysisListItems[0].id;
    });
  }, [analysisListItems, localHistoryLoaded, stockCodeKey]);

  useEffect(() => {
    if (!localHistoryLoaded) return;
    if (activeAnalysisId) localStorage.setItem(LOCAL_ANALYSIS_ACTIVE_ID_KEY, activeAnalysisId);
    else localStorage.removeItem(LOCAL_ANALYSIS_ACTIVE_ID_KEY);
  }, [activeAnalysisId, localHistoryLoaded]);

  const activeReport = useMemo(
    () => analysisEntries.find((x) => x.id === activeAnalysisId) ?? report ?? null,
    [analysisEntries, activeAnalysisId, report],
  );

  const activeIsLatest = !!(activeReport && report && activeReport.id === report.id);
  const activeSymbolName = useMemo(() => {
    if (!activeReport) return "未命名标的";
    const key = `${activeReport.market}.${activeReport.symbol}`;
    return resolveAnalyzeListPrimaryName(
      activeReport,
      activeReport.market,
      activeReport.symbol,
      searchItemNameByKey.get(key),
    );
  }, [activeReport, searchItemNameByKey]);
  const activeRealtimeFacts = useMemo(() => {
    if (!activeReport) return [];
    const changeTone = liveQuote ? (liveQuote.change > 0 ? "up" : liveQuote.change < 0 ? "down" : "neutral") : "neutral";
    const baseFacts: FactItem[] = [
      { label: "最新价", value: liveQuote ? liveQuote.price.toFixed(2) : "--", tone: changeTone },
      {
        label: "涨跌幅",
        value: liveQuote ? `${liveQuote.changePct >= 0 ? "+" : ""}${liveQuote.changePct.toFixed(2)}%` : "--",
        tone: changeTone,
      },
      {
        label: "涨跌额",
        value: liveQuote ? `${liveQuote.change >= 0 ? "+" : ""}${liveQuote.change.toFixed(2)}` : "--",
        tone: changeTone,
      },
    ];
    return [...baseFacts, ...buildBasicFacts(activeReport.market, activeReport.symbol, liveQuote)];
  }, [activeReport, liveQuote]);

  const strategyLevels = useMemo(() => {
    if (!activeReport) return null;
    const focusNums = extractNumbers(activeReport.plan.focus_range);
    const stopNums = extractNumbers(activeReport.plan.risk_level_price);
    const targetNums = extractNumbers(activeReport.plan.target_price);

    const idealBuy = focusNums.length ? focusNums[0] : null;
    const rangeHigh = focusNums.length > 1 ? focusNums[1] : null;
    const secondaryBuy =
      idealBuy !== null
        ? Number(
            (idealBuy - Math.max(0.05, ((rangeHigh ?? idealBuy) - idealBuy + 0.6) * 0.12)).toFixed(2),
          )
        : null;
    const stopLoss = stopNums.length ? stopNums[0] : null;
    const takeProfit = targetNums.length ? targetNums[0] : null;

    return { idealBuy, secondaryBuy, stopLoss, takeProfit };
  }, [activeReport]);

  const targetPriceRows = useMemo<TargetPriceRow[]>(() => {
    if (!activeReport) return [];

    const focusNums = extractNumbers(activeReport.plan.focus_range);
    const targetNums = extractNumbers(activeReport.plan.target_price);
    const stopNums = extractNumbers(activeReport.plan.risk_level_price);
    const anchor = liveQuote?.price ?? strategyLevels?.idealBuy ?? focusNums[0] ?? null;
    const shortTarget = strategyLevels?.idealBuy ?? focusNums[0] ?? anchor;
    const midTarget = strategyLevels?.secondaryBuy ?? (anchor !== null ? anchor * 0.96 : null);
    const longTarget = targetNums[0] ?? strategyLevels?.takeProfit ?? (anchor !== null ? anchor * 1.08 : null);
    const longLow = stopNums[0] ?? strategyLevels?.stopLoss ?? (anchor !== null ? anchor * 0.9 : null);

    return [
      {
        horizon: "短期（1个月）",
        range: formatPriceRange(shortTarget, longTarget !== null ? longTarget * 0.96 : null),
        target: formatPrice(shortTarget),
        rationale: `优先围绕关注区间（${activeReport.plan.focus_range}）观察支撑确认。`,
      },
      {
        horizon: "中期（3个月）",
        range: formatPriceRange(midTarget, longTarget),
        target: formatPrice(midTarget),
        rationale: `若价格稳定在风险位（${activeReport.plan.risk_level_price}）上方，目标中枢上移。`,
      },
      {
        horizon: "长期（6个月）",
        range: formatPriceRange(longLow, longTarget !== null ? longTarget * 1.06 : null),
        target: formatPrice(longTarget),
        rationale: `以观察目标位（${activeReport.plan.target_price}）为主，失效条件遵循${activeReport.plan.invalidation}。`,
      },
    ];
  }, [activeReport, liveQuote, strategyLevels]);

  const analyzeTocItems = useMemo(() => {
    if (!activeReport) return [] as { id: string; label: string }[];
    const items: { id: string; label: string }[] = [{ id: "analyze-executive-summary", label: "摘要" }];
    if (strategyLevels) items.push({ id: "analyze-strategy", label: "策略点位" });
    if (targetPriceRows.length) items.push({ id: "analyze-target-prices", label: "目标价" });
    if (liveQuote) items.push({ id: "analyze-quote", label: "行情" });
    items.push(
      { id: "analyze-score-plan", label: "评分与计划" },
      { id: "analyze-evidence", label: "依据" },
      { id: "analyze-reflection", label: "反思" },
    );
    return items;
  }, [activeReport, liveQuote, strategyLevels, targetPriceRows.length]);

  const targetPriceCurrency = activeReport ? getCurrencyLabel(activeReport.market) : "HK$";

  const quoteStatusLabel = useMemo(() => {
    if (quoteViewStatus === "live") return "实时";
    if (quoteViewStatus === "cached") return "缓存";
    if (quoteViewStatus === "error") return "更新失败";
    return "未启用";
  }, [quoteViewStatus]);

  const handleRefreshAnalyzeQuote = useCallback(async () => {
    if (!activeReport || activeReport.market !== "CN") return;
    setQuoteRefreshing(true);
    try {
      const quote = await requestStockQuote(activeReport.symbol, { force: true });
      setLiveQuote(quote ? toBasicQuote(quote) : null);
      setQuoteViewStatus(quote ? "live" : "error");
    } catch {
      setQuoteViewStatus("error");
    } finally {
      setQuoteRefreshing(false);
    }
  }, [activeReport]);

  useEffect(() => {
    if (!activeReport) {
      setLiveQuote(null);
      setQuoteViewStatus("idle");
      return;
    }
    let canceled = false;
    const shouldFetch = activeReport.market === "CN";

    if (!shouldFetch) {
      setLiveQuote(null);
      setQuoteViewStatus("idle");
      return;
    }

    const pull = async (force: boolean) => {
      try {
        const quote = await requestStockQuote(activeReport.symbol, { force });
        if (canceled) return;
        setLiveQuote(quote ? toBasicQuote(quote) : null);
        setQuoteViewStatus(quote ? (force ? "live" : "cached") : "error");
      } catch {
        if (canceled) return;
        setQuoteViewStatus("error");
        // 保留上一次有效行情，避免接口抖动导致展示闪断。
      }
    };

    void pull(false);
    const timer = window.setInterval(() => {
      void pull(true);
    }, 15_000);

    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [activeReport]);

  useEffect(() => {
    if (!pendingHandoff) return;
    const h = pendingHandoff;
    queueMicrotask(() => {
      setSearchKeyword(`${h.market}.${h.symbol}`);
      setSelectedSearchKey(null);
      setMarket(h.market);
      setRiskTier(h.preference_snapshot.risk_tier);
      setHoldingHorizon(h.preference_snapshot.holding_horizon);
      setLinkedPreference(h.preference_snapshot);
      setPendingHandoff(null);
      if (useNotificationPreferencesStore.getState().notifyTaskComplete) {
        toast.message(analyzeCopy.handoffToast);
      }
    });
  }, [pendingHandoff, setPendingHandoff]);

  useEffect(() => {
    if (searchKeyword.trim() || recentKeys.length === 0) return;
    const first = recentKeys[0];
    const [mk, sym] = first.split(".") as [AnalysisInput["market"], string];
    if (mk && sym) {
      setSearchKeyword(first);
      setSelectedSearchKey(null);
      setMarket(mk);
    }
  }, [recentKeys, searchKeyword]);

  useEffect(() => {
    const keyword = searchKeyword.trim();
    // 输入框未聚焦/下拉关闭时，不应继续触发远程搜索。
    if (!searchComboboxOpen) {
      setRemoteSearching((prev) => (prev ? false : prev));
      return;
    }
    // 已选中候选项时，输入框值通常是展示文本（例如 名称+代码），不应继续触发远程搜索。
    if (selectedSearchKey) {
      setRemoteSearchItems((prev) => (prev.length > 0 ? [] : prev));
      setRemoteSearching((prev) => (prev ? false : prev));
      return;
    }

    const picked = parseSearchInput(searchKeyword, market);
    const searchTerm = picked?.symbol?.trim() || keyword;
    if (authSession !== "user" || !searchTerm || (picked && picked.market !== "CN")) {
      setRemoteSearchItems((prev) => (prev.length > 0 ? [] : prev));
      setRemoteSearching((prev) => (prev ? false : prev));
      return;
    }

    let canceled = false;
    setRemoteSearching(true);
    const timer = window.setTimeout(() => {
      void requestStockSearch(searchTerm, 6)
        .then((items) => {
          if (!canceled) {
            setRemoteSearchItems(items);
            setRemoteSearching(false);
          }
        })
        .catch(() => {
          if (!canceled) {
            setRemoteSearchItems([]);
            setRemoteSearching(false);
          }
        });
    }, 200);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
    // 勿依赖 selectedInput：其为每次 useMemo 新对象；远程结果更新后 searchItems 里条目引用会变，
    // 会误触发无限轮询。用 key / keyword 等标量表达「搜什么」即可。
  }, [authSession, searchKeyword, market, selectedSearchKey, searchComboboxOpen]);

  const applySearchItem = (item: SearchItem) => {
    setMarket(item.market);
    setSelectedSearchKey(item.key);
    setSearchKeyword(`${item.name}（${formatAnalyzeBoardSymbol(item.market, item.symbol)}）`);
  };

  const executeAnalysis = async (input: AnalysisInput, displayKeyword: string) => {
    setMarket(input.market);
    setSearchKeyword(displayKeyword);
    setSelectedSearchKey(null);
    updateStockCodeParam(`${input.market}.${input.symbol}`);
    setRiskTier(input.risk_tier);
    setHoldingHorizon(input.holding_horizon);
    setLinkedPreference(input.preference_snapshot ?? null);
    const ok = await generateReport(input);
    if (ok && useNotificationPreferencesStore.getState().notifyTaskComplete) {
      toast.success("报告已更新");
    } else if (useAnalysisStore.getState().error === "quota") setQuotaOpen(true);
    return ok;
  };

  const downloadMd = async () => {
    if (!activeReport) return;
    try {
      let blob: Blob;
      if (authSession === "user") {
        const remote = await requestReportFile(activeReport.symbol, "markdown");
        blob = remote.blob;
      } else {
        const md = activeIsLatest ? buildMarkdown() : buildMarkdownFromReport(activeReport);
        if (!md) return;
        blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `择时报告-${activeReport.market}.${activeReport.symbol}-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
      if (useNotificationPreferencesStore.getState().notifyWorkspaceActions) {
        toast.message(analyzeCopy.exportMdToast);
      }
    } catch {
      toast.error("导出 Markdown 失败，请稍后重试");
    }
  };

  const downloadHtml = () => {
    if (!activeReport) return;
    const html = buildHtmlFromReport(activeReport);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `择时报告-${activeReport.market}.${activeReport.symbol}-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
    if (useNotificationPreferencesStore.getState().notifyWorkspaceActions) {
      toast.message("HTML 报告已导出");
    }
  };

  const printPdf = async () => {
    if (!activeReport) return;
    try {
      if (authSession !== "user") {
        window.print();
        return;
      }
      const { blob } = await requestReportFile(activeReport.symbol, "pdf");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error("导出 PDF 失败，请稍后重试");
    }
  };

  const openWebReport = () => {
    if (!activeReport) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("stockCode", `${activeReport.market}.${activeReport.symbol}`);
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const statusLiveMessage = loading
    ? `报告生成中，请稍候。${progress?.message ? `当前进度：${progress.progress}%（${progress.message}）` : ""}`
    : error === "unknown"
      ? "报告生成失败，请调整参数后重试。"
      : activeReport
        ? `报告已更新，当前标的是 ${activeReport.market}.${activeReport.symbol}。`
        : "请先填写参数并生成报告。";
  const isInitialHydrating = !localHistoryLoaded || !archiveHydrated;

  return (
    <AppPageLayout
      title="股票预测"
      hideHeader
      contentClassName="gap-4"
    >
      <p className="sr-only" aria-live="polite">
        {statusLiveMessage}
      </p>

      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <StockSearchCombobox
            query={searchKeyword}
            onQueryChange={(next) => {
              setSearchKeyword(next);
              setSelectedSearchKey(null);
            }}
            items={filteredSearchItems}
            loading={remoteSearching}
            title={searchKeyword.trim() ? "搜索结果" : "最近使用"}
            emptyMessage="无匹配标的"
            placeholder="代码或简称，例如 茅台、AAPL"
            ariaLabel="搜索股票"
            inputId="analyze-stock-search-input"
            listId="analyze-stock-search-listbox"
            formatCode={(item) => `${item.market}.${item.symbol}`}
            onSelect={(item) => applySearchItem(item)}
            onOpenChange={setSearchComboboxOpen}
            onResolveEnter={(rawQuery, activeItem) => {
              if (activeItem) {
                applySearchItem(activeItem);
                return;
              }
              const parsed = parseSearchInput(rawQuery, market);
              if (parsed?.symbol) {
                setSelectedSearchKey(null);
                setSearchKeyword(`${parsed.market}.${parsed.symbol}`);
                return;
              }
              setConfigOpen(true);
            }}
          />
          <Button type="button" disabled={loading} onClick={() => setConfigOpen(true)}>
            {loading ? (
              <>
                <Spinner />
                {progress?.progress && progress.progress > 0
                  ? `分析中 ${progress.progress}%`
                  : "分析中"}
              </>
            ) : (
              "分析"
            )}
          </Button>
          <InfoTip label="搜索格式说明">
            <span className="block">支持代码或简称搜索；使用 CN.600519 可指定市场。</span>
          </InfoTip>
        </div>
        <Button type="button" variant="outline" className="shrink-0" onClick={() => router.push("/app/pick")}>
          选股
        </Button>
      </div>
      {linkedPreference ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Badge variant="secondary">已关联偏好</Badge>
          <InfoTip label="关联偏好详情">
            <span className="block">{preferenceSummary(linkedPreference)}</span>
          </InfoTip>
          <Button type="button" variant="link" onClick={() => setLinkedPreference(null)}>
            清除
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-stretch">
        <section className="rounded-lg border p-1.5 print:hidden lg:flex lg:min-h-0 lg:h-full lg:flex-col">
          {isInitialHydrating ? (
            <AnalyzeHistorySkeleton />
          ) : analysisListItems.length ? (
            <ScrollArea className="lg:min-h-0 lg:flex-1">
              <div className="flex flex-col gap-1.5 px-0.5 py-0.5">
                <AnalysisHistoryList
                  running={analysisListDisplay.running}
                  done={analysisListDisplay.done}
                  activeAnalysisId={activeAnalysisId}
                  onSelect={(item) => selectAnalysisFromHistory(item)}
                />
              </div>
            </ScrollArea>
          ) : (
            <PageEmptyState
              className="border-0 shadow-none"
              icon={<HistoryIcon />}
              title="暂无分析记录"
              description="输入股票代码或名称后点击「分析」，系统会生成并保存报告。"
              actions={
                <Button type="button" variant="outline" onClick={() => setConfigOpen(true)} disabled={loading}>
                  开始分析
                </Button>
              }
            />
          )}
        </section>

        <div id="analyze-print-root" className="min-w-0 scroll-smooth flex flex-col gap-4 print:gap-3">
        {isInitialHydrating ? (
          <AnalyzeReportSkeleton />
        ) : null}
        {loading && !report ? (
          <PageLoadingState
            className="print:analyze-hide"
            title="正在生成择时报告"
            description={
              progress?.message
                ? `${progress.message}${progress.progress > 0 ? `（${progress.progress}%）` : ""}`
                : "正在计算评分与结论。"
            }
          />
        ) : null}

        {error === "unknown" ? (
          <PageErrorState
            className="print:analyze-hide"
            title="报告生成失败"
            description="请检查代码与市场后点「重新生成」。"
            actions={
              <Button type="button" variant="secondary" onClick={() => setConfigOpen(true)} disabled={loading}>
                重新生成
              </Button>
            }
          />
        ) : null}

        {!isInitialHydrating && !loading && error !== "unknown" && !activeReport ? (
          <PageEmptyState
            className="print:analyze-hide"
            icon={<FileTextIcon />}
            title="还没有可展示的报告"
            description="可先从上方搜索标的，再点击「分析」生成首份报告。支持输入代码、简称或 CN.600519。"
            actions={
              <Button type="button" onClick={() => setConfigOpen(true)}>
                立即开始
              </Button>
            }
          />
        ) : null}

        {activeReport ? (
          <>
            <div
              ref={analyzeReportScrollRef}
              id="analyze-report-root"
              className="flex min-w-0 flex-col gap-6 print:break-inside-avoid"
            >
              <header className="sticky top-4 z-20 border-b bg-background/95 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 print:static print:border-0">
                <div className="flex w-full flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-xl font-semibold">
                      {activeSymbolName}({formatAnalyzeBoardSymbol(activeReport.market, activeReport.symbol)})
                    </p>
                    <div className="flex shrink-0 items-center gap-2 print:hidden">
                      <Button type="button" variant="outline" onClick={openWebReport}>
                        <EyeIcon data-icon="inline-start" />
                        查看报告
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button type="button" variant="outline" aria-label="导出报告">
                              <FolderDownIcon data-icon="inline-start" />
                              导出报告
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" side="bottom" className="min-w-56">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>导出</DropdownMenuLabel>
                            <DropdownMenuItem onClick={downloadMd}>
                              <FileTextIcon data-icon="inline-start" />
                              导出 Markdown
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={printPdf}>
                              <FileDownIcon data-icon="inline-start" />
                              导出 PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={downloadHtml}>
                              <GlobeIcon data-icon="inline-start" />
                              导出 HTML
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <nav aria-label="报告目录" className="print:hidden">
                    <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {analyzeTocItems.map((toc) => (
                        <button
                          key={toc.id}
                          type="button"
                          className="text-muted-foreground hover:text-foreground shrink-0 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
                          onClick={() => {
                            document.getElementById(toc.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          {toc.label}
                        </button>
                      ))}
                    </div>
                  </nav>
                </div>
              </header>

              <div className="flex w-full flex-col gap-6">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <section id="analyze-executive-summary" className="scroll-mt-28 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">当前建议</p>
                    <p className="mt-1 text-sm font-medium">
                      <Badge
                        variant="outline"
                        className={actionBadgeClassNames[activeReport.action] ?? actionBadgeClassNames.wait}
                      >
                        {actionLabels[activeReport.action] ?? activeReport.action}
                      </Badge>
                    </p>
                  </section>
                  <section className="scroll-mt-28 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">风险等级</p>
                    <p className="mt-1 text-sm font-medium">{activeReport.risk_level}</p>
                  </section>
                  <section className="scroll-mt-28 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">仓位建议</p>
                    <p className="mt-1 text-sm font-medium">{activeReport.plan.risk_exposure_pct}</p>
                  </section>
                  <section className="scroll-mt-28 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">失效条件</p>
                    <p className="mt-1 text-sm font-medium">见执行计划</p>
                  </section>
                  <section className="scroll-mt-28 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">有效期</p>
                    <p className="mt-1 text-sm font-medium">{activeReport.plan.valid_until}</p>
                  </section>
                  <section className="scroll-mt-28 rounded-md border p-3 xl:col-span-3 xl:row-span-2">
                    <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                      <FileTextIcon className="size-3.5" />
                      结论说明
                    </p>
                    <p className="text-foreground mt-2 text-sm leading-6">{activeReport.action_reason}</p>
                  </section>
                  <section className="scroll-mt-28 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">综合得分</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">{activeReport.score_breakdown.total}</p>
                  </section>
                  <section className="scroll-mt-28 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">置信度</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">{activeReport.confidence}</p>
                  </section>
                  <section className="scroll-mt-28 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">技术信号</p>
                    <p className="mt-1 text-base font-semibold">
                      {getTechnicalSignal(activeReport.score_breakdown.technical)}
                    </p>
                  </section>
                  <section className="scroll-mt-28 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">技术分</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">
                      {activeReport.score_breakdown.technical}/60
                    </p>
                  </section>
                </div>

                {strategyLevels ? (
                  <section id="analyze-strategy" className="scroll-mt-28 flex flex-col gap-3 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="flex items-center gap-1.5 text-sm font-medium">
                        <MapPinIcon className="size-3.5 text-muted-foreground" />
                        策略点位
                      </h2>
                      <Badge variant="outline">执行参考</Badge>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="py-1">
                        <p className="text-muted-foreground text-xs">理想买入点</p>
                        <p className="text-base font-semibold">
                          {strategyLevels.idealBuy !== null ? `${strategyLevels.idealBuy.toFixed(2)} 元` : "见关注区间"}
                        </p>
                        <p className="text-muted-foreground text-xs">回踩支撑区优先布局</p>
                      </div>
                      <div className="py-1">
                        <p className="text-muted-foreground text-xs">次优买入点</p>
                        <p className="text-base font-semibold">
                          {strategyLevels.secondaryBuy !== null
                            ? `${strategyLevels.secondaryBuy.toFixed(2)} 元`
                            : "见关注区间"}
                        </p>
                        <p className="text-muted-foreground text-xs">二次回落时分批介入</p>
                      </div>
                      <div className="py-1">
                        <p className="text-muted-foreground text-xs">止损位</p>
                        <p className="text-base font-semibold">
                          {strategyLevels.stopLoss !== null ? `${strategyLevels.stopLoss.toFixed(2)} 元` : "见风险位"}
                        </p>
                        <p className="text-muted-foreground text-xs">跌破关键位严格执行</p>
                      </div>
                      <div className="py-1">
                        <p className="text-muted-foreground text-xs">目标位</p>
                        <p className="text-base font-semibold">
                          {strategyLevels.takeProfit !== null
                            ? `${strategyLevels.takeProfit.toFixed(2)} 元`
                            : "见观察目标位"}
                        </p>
                        <p className="text-muted-foreground text-xs">分批止盈并跟踪抬升</p>
                      </div>
                    </div>
                  </section>
                ) : null}

                {targetPriceRows.length ? (
                  <section id="analyze-target-prices" className="scroll-mt-28 flex flex-col gap-3 rounded-md border p-3">
                    <h2 className="flex items-center gap-1.5 text-sm font-medium">
                      <TargetIcon className="size-3.5 text-muted-foreground" />
                      目标价格分析
                    </h2>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>时间范围</TableHead>
                          <TableHead>目标价格区间（{targetPriceCurrency}）</TableHead>
                          <TableHead>具体价格目标</TableHead>
                          <TableHead className="whitespace-normal">逻辑</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {targetPriceRows.map((item) => (
                          <TableRow key={item.horizon}>
                            <TableCell>{item.horizon}</TableCell>
                            <TableCell>{item.range}</TableCell>
                            <TableCell>{item.target}</TableCell>
                            <TableCell className="whitespace-normal text-sm">{item.rationale}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </section>
                ) : null}

                {activeReport?.market === "CN" ? (
                  <div id="analyze-quote" className="scroll-mt-28 grid gap-3 lg:grid-cols-[3fr_2fr]">
                    <section className="flex flex-col gap-3 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-medium">行情</h2>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{quoteStatusLabel}</Badge>
                          <Badge variant="outline">
                            更新于{" "}
                            {liveQuote
                              ? new Date(liveQuote.updatedAt).toLocaleTimeString("zh-CN", { hour12: false })
                              : "--:--:--"}
                          </Badge>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label="刷新行情"
                                  onClick={() => void handleRefreshAnalyzeQuote()}
                                  disabled={quoteRefreshing}
                                >
                                  <RotateCwIcon className={`size-3.5 ${quoteRefreshing ? "animate-spin" : ""}`} />
                                </Button>
                              }
                            />
                            <TooltipContent side="bottom" align="end">
                              刷新行情
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                        {activeRealtimeFacts.map((fact) => (
                          <div key={fact.label} className="flex items-baseline gap-0 py-0.5">
                            <p className="text-muted-foreground text-xs">{fact.label}：</p>
                            <p
                              className={`text-sm font-medium ${
                                fact.tone === "up"
                                  ? "text-red-600"
                                  : fact.tone === "down"
                                    ? "text-emerald-600"
                                    : "text-foreground"
                              }`}
                            >
                              {fact.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-md border p-3">
                      <h2 className="text-sm font-medium">市场情绪（恐惧贪婪指数）</h2>
                      <div className="mt-2 flex items-end justify-between">
                        <p className="text-2xl font-semibold">51</p>
                        <Badge variant="secondary">{getSentimentLabel(51)}</Badge>
                      </div>
                      <ChartContainer config={sentimentChartConfig} className="mt-2 h-[160px] w-full">
                        <RadarChart data={buildSentimentRadarData(51)} accessibilityLayer>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="metric" />
                          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Radar dataKey="score" fill="var(--color-score)" fillOpacity={0.25} stroke="var(--color-score)" />
                        </RadarChart>
                      </ChartContainer>
                    </section>
                  </div>
                ) : null}

                <div id="analyze-score-plan" className="scroll-mt-28 grid gap-3 xl:grid-cols-2">
                  <section className="flex flex-col gap-3 rounded-md border p-3">
                    <div className="flex flex-row items-center gap-2">
                      <h2 className="text-sm font-medium">评分拆解</h2>
                      <InfoTip label="评分权重">
                        <span className="block">技术 60%，结构与风险 25%，事件折扣 15%。</span>
                      </InfoTip>
                    </div>
                    <div className="flex flex-col gap-1 text-sm">
                      <span>技术 {activeReport.score_breakdown.technical}</span>
                      <Progress value={(activeReport.score_breakdown.technical / 60) * 100} />
                    </div>
                    <div className="flex flex-col gap-1 text-sm">
                      <span>结构与风险 {activeReport.score_breakdown.structure_risk}</span>
                      <Progress value={(activeReport.score_breakdown.structure_risk / 25) * 100} />
                    </div>
                    <div className="flex flex-col gap-1 text-sm">
                      <span>事件折扣 {activeReport.score_breakdown.event_discount}</span>
                      <Progress value={(activeReport.score_breakdown.event_discount / 15) * 100} />
                    </div>
                    <p className="text-sm font-medium">综合 {activeReport.score_breakdown.total}</p>
                  </section>

                  <section className="flex flex-col gap-2 rounded-md border p-3">
                    <h2 className="text-sm font-medium">执行计划</h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border px-3 py-2">
                        <p className="text-muted-foreground text-xs">关注区间</p>
                        <p className="text-sm">{activeReport.plan.focus_range}</p>
                      </div>
                      <div className="rounded-md border px-3 py-2">
                        <p className="text-muted-foreground text-xs">风险位</p>
                        <p className="text-sm">{activeReport.plan.risk_level_price}</p>
                      </div>
                      <div className="rounded-md border px-3 py-2">
                        <p className="text-muted-foreground text-xs">观察目标位</p>
                        <p className="text-sm">{activeReport.plan.target_price}</p>
                      </div>
                      <div className="rounded-md border px-3 py-2">
                        <p className="text-muted-foreground text-xs">风险敞口</p>
                        <p className="text-sm">{activeReport.plan.risk_exposure_pct}</p>
                      </div>
                      <div className="rounded-md border px-3 py-2">
                        <p className="text-muted-foreground text-xs">失效条件</p>
                        <p className="text-sm">{activeReport.plan.invalidation}</p>
                      </div>
                      <div className="rounded-md border px-3 py-2">
                        <p className="text-muted-foreground text-xs">有效期</p>
                        <p className="text-sm">{activeReport.plan.valid_until}</p>
                      </div>
                    </div>
                  </section>
                </div>

                <section id="analyze-evidence" className="scroll-mt-28 flex flex-col gap-3 rounded-md border p-3 text-sm">
                  <div className="flex flex-row items-center gap-2">
                    <h2 className="text-sm font-medium">依据与提醒</h2>
                    <InfoTip label="提醒字段说明">
                      <span className="block">{analyzeCopy.remindersCardDesc}</span>
                    </InfoTip>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">正向 {activeReport.evidence_positive.length}</Badge>
                    <Badge variant="outline">负向 {activeReport.evidence_negative.length}</Badge>
                    <Badge variant="outline">冲突 {activeReport.evidence_conflicts?.length ?? 0}</Badge>
                    <Badge variant="outline">提醒 {activeReport.reminders.length}</Badge>
                  </div>
                  <div className="mt-2 space-y-3">
                    <div className="grid gap-3 xl:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">正向</p>
                        <ul className="text-muted-foreground list-inside list-disc">
                          {activeReport.evidence_positive.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">负向</p>
                        <ul className="text-muted-foreground list-inside list-disc">
                          {activeReport.evidence_negative.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </div>
                      {activeReport.evidence_conflicts?.length ? (
                        <div className="flex flex-col gap-1">
                          <p className="font-medium">冲突</p>
                          <ul className="text-muted-foreground list-inside list-disc">
                            {activeReport.evidence_conflicts.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <p className="font-medium">冲突</p>
                          <p className="text-muted-foreground">当前无显著冲突信号。</p>
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">执行提醒</p>
                      <ul className="text-muted-foreground list-inside list-disc">
                        {activeReport.reminders.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>

                <section id="analyze-reflection" className="scroll-mt-28 flex flex-col gap-3 rounded-md border p-3">
                  <h2 className="text-sm font-medium">历史反思与改进</h2>
                  <div className="text-muted-foreground flex flex-col gap-3 text-sm leading-6">
                    <p>
                      过去在类似行情中，市场容易对短期价格波动反应过度，忽略了中期结构性风险。当前这次评估中，优先关注
                      <span className="font-semibold text-foreground"> 结构性风险、盈利质量、竞争格局 </span>
                      等核心因素，而不是只依赖单一技术指标。
                    </p>
                    <p>
                      本次不会因为多空信号并存而简单给出“持有”判断，而是围绕
                      <span className="font-semibold text-foreground"> 最有解释力的负向线索 </span>
                      设定执行边界，结合风险位与失效条件动态调整仓位决策。
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </>
        ) : null}
        </div>
      </div>

      <AnalyzeRunConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        loading={loading}
        symbolSearchItems={searchItems}
        searchKeyword={searchKeyword}
        market={market}
        riskTier={riskTier}
        holdingHorizon={holdingHorizon}
        linkedPreference={linkedPreference}
        onConfirm={async ({ input, displayKeyword }) => {
          setConfigOpen(false);
          return await executeAnalysis(input, displayKeyword);
        }}
      />

      <AlertDialog open={quotaOpen} onOpenChange={setQuotaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>今日额度已用完</AlertDialogTitle>
            <AlertDialogDescription>{analyzeCopy.quotaDialogBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel>关闭</AlertDialogCancel>
            <Button type="button" variant="secondary" onClick={() => router.push("/app/account/subscription")}>
              {subscriptionTierPublicCopy.ctaViewPlansShort}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppPageLayout>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={<PageLoadingState title="页面加载中" description="正在恢复查询参数与分析上下文。" />}>
      <AnalyzePageContent />
    </Suspense>
  );
}
