"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChartLineIcon, CircleHelpIcon } from "lucide-react";
import { toast } from "sonner";
import type { AnalysisInput } from "@/lib/contracts/domain";
import {
  formatAnalyzeBoardSymbol,
  fuzzyAnalyzeSymbolScore,
  parseAnalyzeSearchInput,
  type AnalyzeSymbolSearchItem,
} from "@/lib/analyze-symbol-search";
import { requestStockSearch } from "@/lib/api/stocks";
import { buildMockBaseQuote, quoteCurrencyLabel } from "@/lib/mock-base-quote";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageLoadingState } from "@/components/features/page-state";
import { StockSearchCombobox } from "@/components/features/stock-search-combobox";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";
import {
  PAPER_TRADING_STARTING_CASH_CNY,
  paperTradingFxCnyPerUnit,
  usePaperTradingStore,
} from "@/stores/use-paper-trading-store";

type Instrument = {
  market: AnalysisInput["market"];
  symbol: string;
  name: string;
};

function entryKey(entry: Pick<Instrument, "market" | "symbol">) {
  return `${entry.market}.${entry.symbol}`.toUpperCase();
}

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

function universeItemToInstrument(item: AnalyzeSymbolSearchItem): Instrument {
  return { market: item.market, symbol: item.symbol.trim(), name: item.name };
}

function tryResolveInstrumentFromPool(
  raw: string,
  fallbackMarket: AnalysisInput["market"],
  pool: readonly AnalyzeSymbolSearchItem[],
): Instrument | null {
  const parsed = parseAnalyzeSearchInput(raw, fallbackMarket);
  if (!parsed?.symbol) return null;
  const sym = parsed.symbol.trim();
  if (!sym) return null;
  const market = parsed.market;
  const hitPreferred = pool.find(
    (u) => u.symbol.toLowerCase() === sym.toLowerCase() && u.market === market,
  );
  if (hitPreferred) return universeItemToInstrument(hitPreferred);
  const hitAny = pool.find((u) => u.symbol.toLowerCase() === sym.toLowerCase());
  if (hitAny) return universeItemToInstrument(hitAny);
  return { market, symbol: normalizeSymbol(sym), name: normalizeSymbol(sym) };
}

function compactBoardCode(market: AnalysisInput["market"], symbol: string) {
  return formatAnalyzeBoardSymbol(market, symbol).replace(":", "");
}

function formatSignedPct(n: number) {
  const fixed = n.toFixed(2);
  if (n > 0) return `+${fixed}%`;
  return `${fixed}%`;
}

function quoteToneClass(changePct: number) {
  if (changePct > 0) return "text-red-600 dark:text-red-500";
  if (changePct < 0) return "text-emerald-600 dark:text-emerald-500";
  return "text-muted-foreground";
}

function formatCny(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLocalPrice(market: AnalysisInput["market"], price: number) {
  const cur = quoteCurrencyLabel(market);
  return `${cur}${price.toFixed(2)}`;
}

function formatFillTime(ts: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(ts));
}

const COPY_PAGE_DETAIL =
  "成交价与估值均来自本地 mock 行情（与预测页相同算法，不拉取交易所实时价）；资金、持仓、成交与最近搜索保存在当前浏览器。港股、美股按固定参考汇率折算为人民币，统一计入资金池。";

const COPY_SIM_DISCLAIMER_DETAIL =
  "本模块不构成投资建议，也不连接券商或交易所；成交价与盈亏均为本地推算结果，与实盘成交条件无关。";

const SIM_DISCLAIMER_STORAGE_KEY = "zhputian-paper-trading-sim-disclaimer-v1";

const COPY_MARKET_VALUE_DETAIL =
  "按各标的现价乘以持仓股数，并以固定参考汇率统一折算为人民币后的合计市值；与「总资产」中的现金加总后即为账户权益。";

const COPY_EMPTY_POSITION_DETAIL =
  "在页面右侧完成一笔买入后，将在此表展示持仓数量、成本、现价、折算市值与浮动盈亏。";

const COPY_EMPTY_FILLS_DETAIL = "买入或卖出成功后，将按时间倒序列出每笔成交的方向、股数、成交价与人民币发生额。";

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            className="text-muted-foreground shrink-0"
          >
            <CircleHelpIcon />
          </Button>
        }
      />
      <TooltipContent side="bottom" align="start" className="max-w-sm">
        <div className="text-pretty leading-relaxed">{children}</div>
      </TooltipContent>
    </Tooltip>
  );
}

export default function PaperTradingPage() {
  const hydrated = useStoreHydrated(usePaperTradingStore);
  const authSession = useAuthStore((s) => s.session);
  const cashCny = usePaperTradingStore((s) => s.cashCny);
  const positions = usePaperTradingStore((s) => s.positions);
  const fills = usePaperTradingStore((s) => s.fills);
  const recentInstruments = usePaperTradingStore((s) => s.recentInstruments);
  const rememberInstrument = usePaperTradingStore((s) => s.rememberInstrument);
  const placeBuy = usePaperTradingStore((s) => s.placeBuy);
  const placeSell = usePaperTradingStore((s) => s.placeSell);
  const resetPortfolio = usePaperTradingStore((s) => s.resetPortfolio);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [shareInput, setShareInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [simDisclaimerOpen, setSimDisclaimerOpen] = useState(false);
  const [remoteSearching, setRemoteSearching] = useState(false);
  const [remoteSearchItems, setRemoteSearchItems] = useState<AnalyzeSymbolSearchItem[]>([]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (!window.localStorage.getItem(SIM_DISCLAIMER_STORAGE_KEY)) {
        setSimDisclaimerOpen(true);
      }
    } catch {
      setSimDisclaimerOpen(true);
    }
  }, [hydrated]);

  const acknowledgeSimDisclaimer = useCallback(() => {
    try {
      window.localStorage.setItem(SIM_DISCLAIMER_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures; dialog will reappear on next visit.
    }
    setSimDisclaimerOpen(false);
  }, []);

  const q = query.trim();

  const searchItems = useMemo(() => {
    const byKey = new Map<string, AnalyzeSymbolSearchItem>();
    for (const item of remoteSearchItems) byKey.set(item.key, item);
    for (const p of positions) {
      const k = `${p.market}.${p.symbol}`;
      if (!byKey.has(k)) {
        byKey.set(k, { key: k, market: p.market, symbol: p.symbol.trim(), name: p.name });
      }
    }
    for (const r of recentInstruments) {
      const k = `${r.market}.${r.symbol.trim()}`;
      const cur = byKey.get(k);
      const name = (r.name.trim() || r.symbol).trim();
      if (cur) {
        byKey.set(k, { ...cur, name: name || cur.name });
      } else {
        byKey.set(k, { key: k, market: r.market, symbol: r.symbol.trim(), name: name || r.symbol });
      }
    }
    const list = Array.from(byKey.values());
    const recentOrder = new Map(
      recentInstruments.map((r, i) => [`${r.market}.${r.symbol.trim()}`, i]),
    );
    list.sort((a, b) => {
      const ka = `${a.market}.${a.symbol.trim()}`;
      const kb = `${b.market}.${b.symbol.trim()}`;
      const ia = recentOrder.get(ka) ?? 9999;
      const ib = recentOrder.get(kb) ?? 9999;
      if (ia !== ib) return ia - ib;
      return a.key.localeCompare(b.key);
    });
    return list;
  }, [remoteSearchItems, positions, recentInstruments]);

  useEffect(() => {
    const keyword = query.trim();
    const parsed = parseAnalyzeSearchInput(keyword, "CN");
    const searchTerm = parsed?.symbol?.trim() || keyword;
    if (authSession !== "user" || !searchTerm || (parsed && parsed.market !== "CN")) {
      setRemoteSearchItems([]);
      setRemoteSearching(false);
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
      setRemoteSearching(false);
    };
  }, [authSession, query]);

  const sellSymbolSet = useMemo(
    () => new Set(positions.map((p) => entryKey({ market: p.market, symbol: p.symbol }))),
    [positions],
  );

  const suggestionItems = useMemo(() => {
    const needle = q.toLowerCase();
    if (!needle) {
      return searchItems.slice(0, 6);
    }
    return searchItems
      .map((item, index) => ({
        item,
        recentRank: index,
        score: fuzzyAnalyzeSymbolScore(item, needle),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.recentRank - b.recentRank;
      })
      .slice(0, 6)
      .map((row) => row.item);
  }, [searchItems, q]);

  const visibleSuggestionItems = useMemo(() => {
    if (side !== "sell") return suggestionItems;
    return suggestionItems.filter((item) => sellSymbolSet.has(entryKey(item)));
  }, [side, suggestionItems, sellSymbolSet]);

  const portfolioMetrics = useMemo(() => {
    let marketValueCny = 0;
    let costBasisCny = 0;
    for (const p of positions) {
      const quote = buildMockBaseQuote(p.market, p.symbol);
      const fx = paperTradingFxCnyPerUnit(p.market);
      marketValueCny += p.shares * quote.price * fx;
      costBasisCny += p.shares * p.avgCostLocal * fx;
    }
    marketValueCny = Number(marketValueCny.toFixed(2));
    costBasisCny = Number(costBasisCny.toFixed(2));
    const unrealized = Number((marketValueCny - costBasisCny).toFixed(2));
    const totalEquity = Number((cashCny + marketValueCny).toFixed(2));
    return { marketValueCny, costBasisCny, unrealized, totalEquity };
  }, [positions, cashCny]);

  const applyInstrument = useCallback((inst: Instrument) => {
    setSelected(inst);
    rememberInstrument({ market: inst.market, symbol: inst.symbol, name: inst.name });
    setQuery("");
  }, [rememberInstrument]);

  const searchSectionTitle =
    side === "sell"
      ? q
        ? "搜索结果（仅持仓可卖）"
        : "最近使用（仅展示可卖持仓）"
      : q
        ? "搜索结果"
        : "最近使用";

  const searchEmptyMessage =
    side === "sell"
      ? "当前无可卖持仓，请先买入后再卖出。"
      : "没有匹配结果，按 Enter 可按输入代码解析。";

  const onSubmitOrder = () => {
    const shares = Math.floor(Number(shareInput));
    if (!selected) {
      toast.error("请先选择标的");
      return;
    }
    if (!Number.isFinite(shares) || shares < 1) {
      toast.error("请输入不小于 1 的整数股数");
      return;
    }
    setSubmitting(true);
    try {
      if (side === "buy") {
        const r = placeBuy({
          market: selected.market,
          symbol: selected.symbol,
          name: selected.name,
          shares,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("买入已记入模拟账户");
        setShareInput("");
      } else {
        const r = placeSell({
          market: selected.market,
          symbol: selected.symbol,
          shares,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("卖出已记入模拟账户");
        setShareInput("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReset = () => {
    resetPortfolio();
    setSelected(null);
    setShareInput("");
    setResetOpen(false);
    toast.success("已恢复起始资金并清空持仓与成交记录");
  };

  const maxSellShares = useMemo(() => {
    if (!selected) return 0;
    const hit = positions.find((p) => entryKey(p) === entryKey(selected));
    return hit?.shares ?? 0;
  }, [positions, selected]);

  return (
    <AppPageLayout
      title="模拟交易"
      description={
        <span className="text-muted-foreground inline-flex flex-wrap items-center gap-1.5 text-sm">
          <span>本地推算行情记账，资金与持仓仅保存在本机。</span>
          <InfoTip label="模块说明">
            <p>{COPY_PAGE_DETAIL}</p>
          </InfoTip>
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" render={<Link href="/app/analyze" />}>
            去预测
          </Button>
          <Button type="button" variant="outline" onClick={() => setResetOpen(true)}>
            重置账户
          </Button>
        </div>
      }
    >
      {!hydrated ? (
        <PageLoadingState title="正在加载模拟账户" description="请稍候，正在从本机读取资金与持仓。" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card size="sm">
              <CardHeader>
                <CardDescription>可用资金</CardDescription>
                <CardTitle className="text-xl tabular-nums">{formatCny(cashCny)}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription className="flex items-center gap-1">
                  <span>持仓市值</span>
                  <InfoTip label="持仓市值说明">
                    <p>{COPY_MARKET_VALUE_DETAIL}</p>
                  </InfoTip>
                </CardDescription>
                <CardTitle className="text-xl tabular-nums">{formatCny(portfolioMetrics.marketValueCny)}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>浮动盈亏</CardDescription>
                <CardTitle
                  className={cn(
                    "text-xl tabular-nums",
                    portfolioMetrics.unrealized > 0 && "text-red-600 dark:text-red-500",
                    portfolioMetrics.unrealized < 0 && "text-emerald-600 dark:text-emerald-500",
                  )}
                >
                  {formatCny(portfolioMetrics.unrealized)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>总资产</CardDescription>
                <CardTitle className="text-xl tabular-nums">{formatCny(portfolioMetrics.totalEquity)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_min(100%,22rem)]">
            <div className="min-w-0 flex min-h-0 flex-col gap-2" aria-label="持仓与成交">
              <Tabs defaultValue="positions">
                <TabsList>
                  <TabsTrigger value="positions">持仓</TabsTrigger>
                  <TabsTrigger value="fills">成交记录</TabsTrigger>
                </TabsList>
                <TabsContent value="positions" className="mt-4 min-w-0">
                  {positions.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                      <span>暂无持仓</span>
                      <InfoTip label="何时出现持仓">
                        <p>{COPY_EMPTY_POSITION_DETAIL}</p>
                      </InfoTip>
                    </EmptyTitle>
                    <EmptyDescription>在右侧买入后，此处展示持仓与盈亏。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
                  ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标的</TableHead>
                      <TableHead>代码</TableHead>
                      <TableHead className="text-right">持仓</TableHead>
                      <TableHead className="text-right">成本（本地）</TableHead>
                      <TableHead className="text-right">现价（本地）</TableHead>
                      <TableHead className="text-right">市值（人民币）</TableHead>
                      <TableHead className="text-right">浮动盈亏</TableHead>
                      <TableHead className="text-right">盈亏幅度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((p) => {
                      const quote = buildMockBaseQuote(p.market, p.symbol);
                      const fx = paperTradingFxCnyPerUnit(p.market);
                      const mv = Number((p.shares * quote.price * fx).toFixed(2));
                      const cost = Number((p.shares * p.avgCostLocal * fx).toFixed(2));
                      const pnl = Number((mv - cost).toFixed(2));
                      const pnlPct = cost > 1e-6 ? ((pnl / cost) * 100).toFixed(2) : "0.00";
                      const tone =
                        pnl > 0 ? "text-red-600 dark:text-red-500" : pnl < 0 ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground";
                      return (
                        <TableRow key={entryKey(p)}>
                          <TableCell className="max-w-40 truncate font-medium">{p.name}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {compactBoardCode(p.market, p.symbol)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{p.shares}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatLocalPrice(p.market, p.avgCostLocal)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatLocalPrice(p.market, quote.price)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCny(mv)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", tone)}>{formatCny(pnl)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", tone)}>{formatSignedPct(Number(pnlPct))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="fills" className="mt-4 min-w-0">
              {fills.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                      <span>暂无成交</span>
                      <InfoTip label="成交记录说明">
                        <p>{COPY_EMPTY_FILLS_DETAIL}</p>
                      </InfoTip>
                    </EmptyTitle>
                    <EmptyDescription>成交后按时间倒序展示明细。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>方向</TableHead>
                      <TableHead>标的</TableHead>
                      <TableHead className="text-right">股数</TableHead>
                      <TableHead className="text-right">成交价（本地）</TableHead>
                      <TableHead className="text-right">发生金额（人民币）</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fills.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatFillTime(f.at)}</TableCell>
                        <TableCell>{f.side === "buy" ? "买入" : "卖出"}</TableCell>
                        <TableCell>
                          <span className="font-medium">{f.name}</span>
                          <span className="text-muted-foreground ml-2 tabular-nums text-xs">
                            {compactBoardCode(f.market, f.symbol)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{f.shares}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatLocalPrice(f.market, f.priceLocal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCny(f.totalCny)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
              </Tabs>
            </div>

            <div className="min-w-0 mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end lg:sticky lg:top-4 lg:self-start" aria-label="模拟下单">
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-1.5">
                    <span>下单</span>
                    <InfoTip label="资金与搜索范围">
                      <p>
                        起始资金 {formatCny(PAPER_TRADING_STARTING_CASH_CNY)}，以人民币计价资金池。成交价与资产估值均使用与预测页同一套本地 mock 行情（不请求实时行情）。证券候选来源为后端模糊搜索结果与本页持久化的最近搜索/最近交易；未登录时展示本机最近记录并支持直接输入代码。港股、美股资金按固定参考汇率折算为人民币。
                      </p>
                    </InfoTip>
                  </CardTitle>
                  <CardDescription>搜索标的并输入整数股数即可提交买卖。</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Tabs value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
                    <TabsList>
                      <TabsTrigger value="buy">买入</TabsTrigger>
                      <TabsTrigger value="sell">卖出</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <StockSearchCombobox
                    query={query}
                    onQueryChange={setQuery}
                    items={visibleSuggestionItems}
                    loading={remoteSearching}
                    title={searchSectionTitle}
                    emptyMessage={searchEmptyMessage}
                    ariaLabel="模拟交易标的搜索"
                    formatCode={(item) => compactBoardCode(item.market, item.symbol)}
                    onSelect={(item) => applyInstrument(universeItemToInstrument(item))}
                    onResolveEnter={(rawQuery, activeItem) => {
                      if (!rawQuery && activeItem) {
                        applyInstrument(universeItemToInstrument(activeItem));
                        return;
                      }
                      const resolved =
                        tryResolveInstrumentFromPool(rawQuery, "CN", searchItems) ??
                        (activeItem ? universeItemToInstrument(activeItem) : null);
                      if (resolved) applyInstrument(resolved);
                    }}
                  />

                  {side === "sell" && positions.length > 0 ? (
                    <section aria-label="从持仓选择" className="flex flex-col gap-2">
                      <p className="text-muted-foreground text-xs font-medium">从持仓选择</p>
                      <ul className="flex flex-wrap gap-2">
                        {positions.map((p) => (
                          <li key={entryKey(p)}>
                            <Button
                              type="button"
                              size="sm"
                              variant={selected && entryKey(selected) === entryKey(p) ? "secondary" : "outline"}
                              onClick={() =>
                                setSelected({ market: p.market, symbol: p.symbol, name: p.name })
                              }
                            >
                              <span className="max-w-48 truncate">{p.name}</span>
                              <span className="text-muted-foreground tabular-nums">{p.shares} 股</span>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {selected ? (
                    <div className="bg-muted/50 flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{selected.name}</p>
                          <p className="text-muted-foreground tabular-nums">
                            {compactBoardCode(selected.market, selected.symbol)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          render={
                            <Link
                              href={`/app/analyze?stockCode=${encodeURIComponent(`${selected.market}.${selected.symbol}`)}`}
                            />
                          }
                        >
                          <ChartLineIcon />
                          预测
                        </Button>
                      </div>
                      {(() => {
                        const quote = buildMockBaseQuote(selected.market, selected.symbol);
                        const fx = paperTradingFxCnyPerUnit(selected.market);
                        const est = Number((Math.floor(Number(shareInput) || 0) * quote.price * fx).toFixed(2));
                        const tone = quoteToneClass(quote.changePct);
                        return (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <span className={cn("tabular-nums", tone)}>
                              参考价 {formatLocalPrice(selected.market, quote.price)}（{formatSignedPct(quote.changePct)}）
                            </span>
                            {side === "buy" ? (
                              <span className="text-muted-foreground tabular-nums">
                                预估成交金额（人民币）{Number.isFinite(est) && est > 0 ? formatCny(est) : "—"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground tabular-nums">可卖上限 {maxSellShares} 股</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">请通过搜索或（卖出时）从持仓中选择一个标的。</p>
                  )}

                  <div className="flex max-w-full flex-col gap-2 sm:max-w-xs">
                    <Label htmlFor="paper-shares">股数</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id="paper-shares"
                        inputMode="numeric"
                        value={shareInput}
                        onChange={(e) => setShareInput(e.target.value.replace(/\D/g, ""))}
                        placeholder="整数"
                        aria-invalid={
                          shareInput.length > 0 &&
                          (!Number.isFinite(Number(shareInput)) || Number(shareInput) < 1)
                        }
                      />
                      {side === "sell" && maxSellShares > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setShareInput(String(maxSellShares))}
                        >
                          全部
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <Button type="button" disabled={submitting || !selected} onClick={onSubmitOrder}>
                      {submitting ? <Spinner className="size-4" /> : null}
                      {side === "buy" ? "确认买入" : "确认卖出"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={simDisclaimerOpen} onOpenChange={setSimDisclaimerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>非真实交易</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">不构成投资建议；盈亏为本地推算，与实盘无关。</span>
              <span className="text-muted-foreground block text-pretty">{COPY_SIM_DISCLAIMER_DETAIL}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={acknowledgeSimDisclaimer}>我知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置模拟账户</AlertDialogTitle>
            <AlertDialogDescription>
              将恢复起始资金 {formatCny(PAPER_TRADING_STARTING_CASH_CNY)} 并清空持仓与成交记录，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmReset}>
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppPageLayout>
  );
}
