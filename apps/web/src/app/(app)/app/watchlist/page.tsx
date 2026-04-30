"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartLineIcon,
  CircleHelpIcon,
  EllipsisVerticalIcon,
  MinusIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";
import type { AnalysisInput } from "@/lib/contracts/domain";
import {
  ANALYZE_SYMBOL_MOCK_UNIVERSE,
  formatAnalyzeBoardSymbol,
  fuzzyAnalyzeSymbolScore,
  parseAnalyzeSearchInput,
  type AnalyzeSymbolSearchItem,
} from "@/lib/analyze-symbol-search";
import {
  STOCK_QUOTE_CLIENT_CACHE_TTL_MS,
  getStoredStockQuote,
  requestAddStockPortfolio,
  requestDeleteStockPortfolio,
  requestStockQuote,
  requestStockPortfolio,
  requestStockSearch,
  type StockQuote,
} from "@/lib/api/stocks";
import { isStockQuote } from "@/lib/stock-quote";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { StockSearchCombobox } from "@/components/features/stock-search-combobox";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";

const WATCHLIST_STORAGE_KEY_V2 = "app-watchlist-v2";
const WATCHLIST_STORAGE_KEY_V1 = "app-watchlist-symbols";
const WATCHLIST_QUOTE_STORAGE_KEY = "app-watchlist-quotes-v1";

type WatchlistEntry = {
  market: AnalysisInput["market"];
  symbol: string;
  name: string;
};

function entryKey(entry: Pick<WatchlistEntry, "market" | "symbol">) {
  return `${entry.market}.${entry.symbol}`.toUpperCase();
}

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

function universeItemToEntry(item: AnalyzeSymbolSearchItem): WatchlistEntry {
  return { market: item.market, symbol: item.symbol.trim(), name: item.name };
}

function tryResolveEntryFromRaw(raw: string, fallbackMarket: AnalysisInput["market"]): WatchlistEntry | null {
  return tryResolveEntryFromPool(raw, fallbackMarket, ANALYZE_SYMBOL_MOCK_UNIVERSE);
}

function tryResolveEntryFromPool(
  raw: string,
  fallbackMarket: AnalysisInput["market"],
  pool: readonly AnalyzeSymbolSearchItem[],
): WatchlistEntry | null {
  const parsed = parseAnalyzeSearchInput(raw, fallbackMarket);
  if (!parsed?.symbol) return null;
  const sym = parsed.symbol.trim();
  if (!sym) return null;
  const market = parsed.market;
  const hitPreferred = pool.find(
    (u) => u.symbol.toLowerCase() === sym.toLowerCase() && u.market === market,
  );
  if (hitPreferred) return universeItemToEntry(hitPreferred);
  const hitAny = pool.find((u) => u.symbol.toLowerCase() === sym.toLowerCase());
  if (hitAny) return universeItemToEntry(hitAny);
  return { market, symbol: normalizeSymbol(sym), name: normalizeSymbol(sym) };
}

function scoreEntry(entry: WatchlistEntry, query: string) {
  const item: AnalyzeSymbolSearchItem = {
    key: `${entry.market}.${entry.symbol}`,
    market: entry.market,
    symbol: entry.symbol,
    name: entry.name,
  };
  return fuzzyAnalyzeSymbolScore(item, query);
}

/** 展示用代码：与 `formatAnalyzeBoardSymbol` 一致但不带冒号，例如 SH688820。 */
function compactBoardCode(market: AnalysisInput["market"], symbol: string) {
  return formatAnalyzeBoardSymbol(market, symbol).replace(":", "");
}

function formatSignedPct(n: number) {
  const fixed = n.toFixed(2);
  if (n > 0) return `+${fixed}%`;
  return `${fixed}%`;
}

function quoteDataSubtitle(quote: StockQuote): string | null {
  const raw = quote.updateTime?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const hm = d.toLocaleTimeString("zh-CN", { hour12: false });
  if (quote.source?.includes("eastmoney")) return `来源：东方财富｜更新于 ${hm}`;
  return `更新于 ${hm}`;
}

function inferExchange(market: AnalysisInput["market"], symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (market === "HK") return "HK";
  if (market === "US") return "US";
  // A股按代码段粗略映射交易所，未知时回退 SH。
  if (normalized.startsWith("SZ") || normalized.startsWith("00") || normalized.startsWith("30")) return "SZ";
  if (normalized.startsWith("BJ") || normalized.startsWith("8") || normalized.startsWith("4")) return "BJ";
  return "SH";
}

/** A 股常用配色：涨红跌绿；零轴为中性灰。 */
function quoteToneClass(changePct: number) {
  if (changePct > 0) return "text-red-600 dark:text-red-500";
  if (changePct < 0) return "text-emerald-600 dark:text-emerald-500";
  return "text-muted-foreground";
}

function readWatchlistQuoteCache() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WATCHLIST_QUOTE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const cache: Record<string, StockQuote> = {};
    let changed = false;
    for (const [key, value] of Object.entries(parsed)) {
      if (isStockQuote(value)) {
        cache[key] = value;
      } else {
        changed = true;
      }
    }
    if (changed) {
      window.localStorage.setItem(WATCHLIST_QUOTE_STORAGE_KEY, JSON.stringify(cache));
    }
    return cache;
  } catch {
    return {};
  }
}

function writeWatchlistQuoteCache(key: string, quote: StockQuote) {
  if (typeof window === "undefined") return;
  try {
    const cache = readWatchlistQuoteCache();
    cache[key] = quote;
    window.localStorage.setItem(WATCHLIST_QUOTE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore localStorage write failures.
  }
}

function getStoredQuotesByEntryKey(entries: WatchlistEntry[]) {
  const watchlistQuoteCache = readWatchlistQuoteCache();
  const quotes: Record<string, StockQuote> = {};
  for (const entry of entries) {
    if (entry.market !== "CN") continue;
    const key = entryKey(entry);
    const quote = getStoredQuoteForEntry(entry, watchlistQuoteCache);
    if (quote) quotes[key] = quote;
  }
  return quotes;
}

function getStoredQuoteForEntry(entry: WatchlistEntry, cache = readWatchlistQuoteCache()) {
  return cache[entryKey(entry)] ?? getStoredStockQuote(entry.symbol);
}

function mergeQuotesForEntries(
  entries: WatchlistEntry[],
  previous: Record<string, StockQuote>,
  stored: Record<string, StockQuote>,
) {
  const next: Record<string, StockQuote> = {};
  for (const entry of entries) {
    const key = entryKey(entry);
    const quote = stored[key] ?? previous[key];
    if (quote && isStockQuote(quote)) next[key] = quote;
  }
  return next;
}

export default function WatchlistPage() {
  const router = useRouter();
  const authSession = useAuthStore((s) => s.session);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [remoteSearching, setRemoteSearching] = useState(false);
  const [remoteSearchItems, setRemoteSearchItems] = useState<AnalyzeSymbolSearchItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioSyncError, setPortfolioSyncError] = useState<string | null>(null);
  const [quotesByKey, setQuotesByKey] = useState<Record<string, StockQuote>>({});
  const [quoteLoadingKeys, setQuoteLoadingKeys] = useState<Set<string>>(() => new Set());
  const [, setQuoteErrorKeys] = useState<Set<string>>(() => new Set());
  const quoteRequestKeysRef = useRef<Set<string>>(new Set());
  const [deleteTargetKey, setDeleteTargetKey] = useState<string | null>(null);

  const keySet = useMemo(() => new Set(entries.map((e) => entryKey(e))), [entries]);

  const deleteTargetEntry = useMemo(
    () => (deleteTargetKey ? entries.find((e) => entryKey(e) === deleteTargetKey) : undefined),
    [deleteTargetKey, entries],
  );

  useEffect(() => {
    let canceled = false;
    if (authSession === "user") {
      const timer = window.setTimeout(() => {
        if (canceled) return;
        setPortfolioLoading(true);
        setPortfolioSyncError(null);
        void requestStockPortfolio()
          .then((portfolioList) => {
            if (canceled) return;
            const dedup = new Map<string, WatchlistEntry>();
            for (const item of portfolioList) {
              dedup.set(entryKey(item), {
                market: item.market,
                symbol: item.symbol.trim(),
                name: item.name.trim() || item.symbol.trim(),
              });
            }
            const list = Array.from(dedup.values());
            const storedQuotes = getStoredQuotesByEntryKey(list);
            setEntries(list);
            setQuotesByKey((prev) => mergeQuotesForEntries(list, prev, storedQuotes));
            setPortfolioLoading(false);
          })
          .catch((error: unknown) => {
            if (canceled) return;
            const message = error instanceof Error ? error.message : "同步失败";
            setPortfolioSyncError(message);
            setPortfolioLoading(false);
          });
      }, 0);
      return () => {
        canceled = true;
        window.clearTimeout(timer);
      };
    }

    const timer = window.setTimeout(() => {
      if (canceled) return;
      setPortfolioSyncError(null);
      setPortfolioLoading(false);
      try {
        const rawV2 = window.localStorage.getItem(WATCHLIST_STORAGE_KEY_V2);
        if (rawV2) {
          const parsed = JSON.parse(rawV2) as unknown;
          if (Array.isArray(parsed)) {
            const next: WatchlistEntry[] = [];
            for (const row of parsed) {
              if (!row || typeof row !== "object") continue;
              const r = row as Record<string, unknown>;
              const market = r.market;
              const symbol = r.symbol;
              const name = r.name;
              if (market !== "CN" && market !== "HK" && market !== "US") continue;
              if (typeof symbol !== "string" || typeof name !== "string") continue;
              const sym = symbol.trim();
              if (!sym) continue;
              next.push({ market, symbol: sym, name: name.trim() || sym });
            }
            const dedup = new Map<string, WatchlistEntry>();
            for (const e of next) {
              dedup.set(entryKey(e), e);
            }
            const list = [...dedup.values()];
            const storedQuotes = getStoredQuotesByEntryKey(list);
            setEntries(list);
            setQuotesByKey((prev) => mergeQuotesForEntries(list, prev, storedQuotes));
            return;
          }
        }

        const rawV1 = window.localStorage.getItem(WATCHLIST_STORAGE_KEY_V1);
        if (rawV1) {
          const parsed = JSON.parse(rawV1) as unknown;
          if (Array.isArray(parsed)) {
            const migrated: WatchlistEntry[] = [];
            for (const item of parsed) {
              if (typeof item !== "string") continue;
              const resolved = tryResolveEntryFromRaw(item, "CN");
              if (resolved) migrated.push(resolved);
            }
            const dedup = new Map<string, WatchlistEntry>();
            for (const e of migrated) {
              dedup.set(entryKey(e), e);
            }
            const list = [...dedup.values()];
            const storedQuotes = getStoredQuotesByEntryKey(list);
            setEntries(list);
            setQuotesByKey((prev) => mergeQuotesForEntries(list, prev, storedQuotes));
            window.localStorage.setItem(WATCHLIST_STORAGE_KEY_V2, JSON.stringify(list));
            window.localStorage.removeItem(WATCHLIST_STORAGE_KEY_V1);
          }
        }
      } catch {
        // Ignore invalid local storage payload.
      }
    }, 0);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [authSession]);

  useEffect(() => {
    if (authSession === "user") return;
    try {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY_V2, JSON.stringify(entries));
    } catch {
      // Ignore local storage write failures.
    }
  }, [authSession, entries]);

  useEffect(() => {
    let canceled = false;
    const timer = window.setTimeout(() => {
      if (canceled) return;

      if (authSession !== "user") {
        setQuotesByKey({});
        setQuoteLoadingKeys(new Set());
        setQuoteErrorKeys(new Set());
        quoteRequestKeysRef.current.clear();
        return;
      }

      if (!accessToken) {
        return;
      }

      const cnEntries = entries.filter((entry) => entry.market === "CN");
      const activeKeys = new Set(cnEntries.map((entry) => entryKey(entry)));
      for (const key of quoteRequestKeysRef.current) {
        if (!activeKeys.has(key)) quoteRequestKeysRef.current.delete(key);
      }

      for (const entry of cnEntries) {
        const k = entryKey(entry);
        const merged = getStoredQuoteForEntry(entry);
        const freshEnough =
          merged &&
          isStockQuote(merged) &&
          Date.now() - merged.cachedAt < STOCK_QUOTE_CLIENT_CACHE_TTL_MS;
        if (freshEnough) {
          setQuotesByKey((prev) => ({ ...prev, [k]: merged }));
          continue;
        }
        if (quoteRequestKeysRef.current.has(k)) continue;

        quoteRequestKeysRef.current.add(k);
        setQuoteLoadingKeys((prev) => {
          const next = new Set(prev);
          next.add(k);
          return next;
        });
        setQuoteErrorKeys((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });

        void requestStockQuote(entry.symbol)
          .then((quote) => {
            if (canceled) return;
            if (!quote) {
              setQuoteErrorKeys((prev) => {
                const next = new Set(prev);
                next.add(k);
                return next;
              });
              return;
            }
            writeWatchlistQuoteCache(k, quote);
            setQuotesByKey((prev) => ({ ...prev, [k]: quote }));
          })
          .catch(() => {
            if (canceled) return;
            setQuoteErrorKeys((prev) => {
              const next = new Set(prev);
              next.add(k);
              return next;
            });
          })
          .finally(() => {
            quoteRequestKeysRef.current.delete(k);
            if (canceled) return;
            setQuoteLoadingKeys((prev) => {
              const next = new Set(prev);
              next.delete(k);
              return next;
            });
          });
      }
    }, 0);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [authSession, accessToken, entries]);

  const handleRefreshAllQuotes = useCallback(() => {
    if (authSession !== "user" || !accessToken) return;
    const cnEntries = entries.filter((e) => e.market === "CN");
    if (cnEntries.length === 0) return;
    setQuoteErrorKeys(new Set());

    void Promise.all(
      cnEntries.map(async (entry) => {
        const k = entryKey(entry);
        if (quoteRequestKeysRef.current.has(k)) return;
        quoteRequestKeysRef.current.add(k);
        setQuoteLoadingKeys((prev) => {
          const next = new Set(prev);
          next.add(k);
          return next;
        });
        try {
          const q = await requestStockQuote(entry.symbol, { force: true });
          if (q) {
            writeWatchlistQuoteCache(k, q);
            setQuotesByKey((prev) => ({ ...prev, [k]: q }));
          }
          setQuoteErrorKeys((prev) => {
            const next = new Set(prev);
            if (q) next.delete(k);
            else next.add(k);
            return next;
          });
        } catch {
          setQuoteErrorKeys((prev) => {
            const next = new Set(prev);
            next.add(k);
            return next;
          });
        } finally {
          quoteRequestKeysRef.current.delete(k);
          setQuoteLoadingKeys((prev) => {
            const next = new Set(prev);
            next.delete(k);
            return next;
          });
        }
      }),
    );
  }, [authSession, accessToken, entries]);

  const cnQuoteCount = useMemo(() => entries.filter((e) => e.market === "CN").length, [entries]);

  const searchItems = useMemo(() => {
    const byKey = new Map<string, AnalyzeSymbolSearchItem>();
    for (const m of ANALYZE_SYMBOL_MOCK_UNIVERSE) byKey.set(m.key, m);
    for (const item of remoteSearchItems) byKey.set(item.key, item);
    for (const e of entries) {
      const k = entryKey(e);
      if (!byKey.has(k)) {
        byKey.set(k, {
          key: `${e.market}.${e.symbol}`,
          market: e.market,
          symbol: e.symbol.trim(),
          name: e.name.trim() || e.symbol.trim(),
        });
      }
    }
    return Array.from(byKey.values());
  }, [entries, remoteSearchItems]);

  useEffect(() => {
    const keyword = query.trim();
    const parsed = parseAnalyzeSearchInput(keyword, "CN");
    const searchTerm = parsed?.symbol?.trim() || keyword;
    if (authSession !== "user" || !searchTerm || (parsed && parsed.market !== "CN")) {
      const timer = window.setTimeout(() => {
        setRemoteSearchItems([]);
        setRemoteSearching(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    let canceled = false;
    const timer = window.setTimeout(() => {
      setRemoteSearching(true);
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

  const q = query.trim();

  const filteredEntries = useMemo(() => {
    if (!q) return entries;
    return entries
      .map((item) => ({ item, score: scoreEntry(item, q) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.item);
  }, [entries, q]);

  const addSuggestions = useMemo(() => {
    if (!q) return searchItems.filter((u) => !keySet.has(entryKey(u))).slice(0, 6);
    const needle = q.toLowerCase();
    return searchItems
      .filter((u) => !keySet.has(entryKey(u)))
      .map((u, index) => ({
        u,
        recentRank: index,
        score: fuzzyAnalyzeSymbolScore(u, needle),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.recentRank - b.recentRank;
      })
      .slice(0, 6)
      .map((row) => row.u);
  }, [keySet, q, searchItems]);

  const addEntry = useCallback((entry: WatchlistEntry) => {
    const k = entryKey(entry);
    if (authSession === "user") {
      setPortfolioSyncError(null);
      void requestAddStockPortfolio({
        market: entry.market,
        symbol: entry.symbol,
        name: entry.name,
        exchange: inferExchange(entry.market, entry.symbol),
      })
        .then(() => {
          setEntries((prev) => {
            if (prev.some((e) => entryKey(e) === k)) return prev;
            return [entry, ...prev];
          });
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "添加自选失败";
          setPortfolioSyncError(message);
        });
    } else {
      setEntries((prev) => {
        if (prev.some((e) => entryKey(e) === k)) return prev;
        return [entry, ...prev];
      });
    }
    setQuery("");
  }, [authSession]);

  const removeEntry = useCallback((k: string) => {
    if (authSession === "user") {
      const target = entries.find((e) => entryKey(e) === k);
      if (!target) return;
      setPortfolioSyncError(null);
      void requestDeleteStockPortfolio(target.symbol)
        .then(() => {
          setEntries((prev) => prev.filter((e) => entryKey(e) !== k));
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "删除自选失败";
          setPortfolioSyncError(message);
        });
      return;
    }
    setEntries((prev) => prev.filter((e) => entryKey(e) !== k));
  }, [authSession, entries]);

  const listEmpty = entries.length === 0;
  const filterEmpty = !listEmpty && q.length > 0 && filteredEntries.length === 0;

  return (
    <AppPageLayout
      title="自选"
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {authSession === "user" && cnQuoteCount > 0 ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="行情说明"
                    className="text-muted-foreground"
                  >
                    <CircleHelpIcon />
                  </Button>
                }
              />
              <TooltipContent side="bottom" align="end" className="max-w-sm">
                <div className="text-pretty leading-relaxed">
                  A 股展示东方财富快照，服务端与本页均做短时缓存以降低请求频率；可随时点「刷新行情」强制更新。港股、美股暂不展示现价。
                </div>
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={
              authSession !== "user" ||
              !accessToken ||
              cnQuoteCount === 0 ||
              portfolioLoading ||
              quoteLoadingKeys.size > 0
            }
            onClick={handleRefreshAllQuotes}
            aria-label="刷新全部 A 股行情"
          >
            <RotateCwIcon className="size-4" />
            刷新行情
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/app/analyze")}>
            去预测
          </Button>
        </div>
      }
      contentClassName="gap-4"
    >
      <StockSearchCombobox
        query={query}
        onQueryChange={setQuery}
        items={addSuggestions}
        loading={remoteSearching}
        title={q ? "可加入自选" : "最近可选"}
        emptyMessage="无可加入标的"
        placeholder="代码或名称模糊搜索；回车按输入加入自选"
        ariaLabel="自选模糊搜索"
        inputId="watchlist-stock-search-input"
        listId="watchlist-stock-search-listbox"
        formatCode={(item) => compactBoardCode(item.market, item.symbol)}
        onSelect={(item) => addEntry(universeItemToEntry(item))}
        onResolveEnter={(rawQuery, activeItem) => {
          if (activeItem) {
            addEntry(universeItemToEntry(activeItem));
            return;
          }
          if (!rawQuery) return;
          const resolved = tryResolveEntryFromPool(rawQuery, "CN", searchItems);
          if (resolved) addEntry(resolved);
        }}
      />
      {portfolioLoading ? (
        <p className="text-muted-foreground text-sm">正在同步自选股...</p>
      ) : null}
      {portfolioSyncError ? <p className="text-sm text-red-600 dark:text-red-500">{portfolioSyncError}</p> : null}

      {listEmpty ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>暂无自选</EmptyTitle>
            <EmptyDescription>
              在上方输入代码或名称，从「可加入自选」中选择，或按回车将当前输入加入列表。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filterEmpty ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>无匹配自选</EmptyTitle>
            <EmptyDescription>当前关键词未命中列表中的代码或名称，请修改关键词或清空搜索后查看全部。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3 2xl:grid-cols-5" aria-label="自选标的列表">
          {filteredEntries.map((entry) => {
            const k = entryKey(entry);
            const stockCode = `${entry.market}.${entry.symbol}`;
            const quote = quotesByKey[k];
            const quoteLoading = quoteLoadingKeys.has(k);
            const quoteUnsupported = entry.market !== "CN";
            const tone = quote ? quoteToneClass(quote.changePercent) : "text-muted-foreground";
            const quoteMeta = quote ? quoteDataSubtitle(quote) : null;
            const trend =
              quote && quote.changePercent > 0 ? "up" : quote && quote.changePercent < 0 ? "down" : "flat";
            return (
              <Item key={k} render={<li />} variant="outline" size="sm" className="group relative">
                <ItemHeader>
                  <ItemContent className="gap-0">
                    <ItemTitle className="max-w-[10.5rem] truncate">{entry.name}</ItemTitle>
                    <ItemDescription className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-muted-foreground text-[11px] tracking-wide">
                        {compactBoardCode(entry.market, entry.symbol)}
                      </span>
                      <Badge variant="secondary">{entry.market === "CN" ? "A股" : entry.market}</Badge>
                    </ItemDescription>
                  </ItemContent>
                  <ItemContent>
                    <div className={cn("flex min-w-[6.8rem] flex-col items-end gap-0.5 text-right tabular-nums", tone)}>
                      <div className={cn("text-base font-semibold leading-none", quoteLoading && "animate-pulse")}>
                        {quote ? quote.currentPrice.toFixed(2) : "--"}
                      </div>
                      <div className="flex items-center justify-end gap-1 text-[11px] leading-tight">
                        <span className={cn("inline-flex items-center gap-0.5", !quote && "text-muted-foreground")}>
                          {quote ? (
                            trend === "up" ? (
                              <ArrowUpIcon className="size-3" />
                            ) : trend === "down" ? (
                              <ArrowDownIcon className="size-3" />
                            ) : (
                              <MinusIcon className="size-3" />
                            )
                          ) : null}
                          {quote ? (
                            quoteMeta ? (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="cursor-help decoration-dotted underline-offset-2">
                                      {formatSignedPct(quote.changePercent)}
                                    </span>
                                  }
                                />
                                <TooltipContent side="left" align="end" className="max-w-xs">
                                  {quoteMeta}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              formatSignedPct(quote.changePercent)
                            )
                          ) : quoteUnsupported ? (
                            "未接入"
                          ) : (
                            "--"
                          )}
                        </span>
                      </div>
                    </div>
                  </ItemContent>
                  <div className="pointer-events-none absolute top-2 right-2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="text-foreground bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85"
                            aria-label={`操作：${entry.name}`}
                          >
                            <EllipsisVerticalIcon />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" side="bottom" className="min-w-36">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            onClick={() => {
                              router.push(`/app/analyze?stockCode=${encodeURIComponent(stockCode)}`);
                            }}
                          >
                            <ChartLineIcon />
                            分析
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTargetKey(k)}>
                            <Trash2Icon />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </ItemHeader>
              </Item>
            );
          })}
        </ul>
      )}

      <AlertDialog open={deleteTargetKey !== null} onOpenChange={(open) => !open && setDeleteTargetKey(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>移除自选？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetEntry
                ? `确定从自选列表移除「${deleteTargetEntry.name}」（${compactBoardCode(deleteTargetEntry.market, deleteTargetEntry.symbol)}）吗？`
                : "确定从自选列表移除此标的吗？"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const key = deleteTargetKey;
                setDeleteTargetKey(null);
                if (key !== null) removeEntry(key);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppPageLayout>
  );
}
