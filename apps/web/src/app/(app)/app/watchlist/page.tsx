"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartLineIcon, EllipsisVerticalIcon, Trash2Icon } from "lucide-react";
import type { AnalysisInput } from "@/lib/contracts/domain";
import {
  ANALYZE_SYMBOL_MOCK_UNIVERSE,
  formatAnalyzeBoardSymbol,
  fuzzyAnalyzeSymbolScore,
  parseAnalyzeSearchInput,
  type AnalyzeSymbolSearchItem,
} from "@/lib/analyze-symbol-search";
import {
  requestAddStockPortfolio,
  requestDeleteStockPortfolio,
  requestStockPortfolio,
  requestStockSearch,
} from "@/lib/api/stocks";
import { buildMockBaseQuote } from "@/lib/mock-base-quote";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { StockSearchCombobox } from "@/components/features/stock-search-combobox";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";

const WATCHLIST_STORAGE_KEY_V2 = "app-watchlist-v2";
const WATCHLIST_STORAGE_KEY_V1 = "app-watchlist-symbols";

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

export default function WatchlistPage() {
  const router = useRouter();
  const authSession = useAuthStore((s) => s.session);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [remoteSearching, setRemoteSearching] = useState(false);
  const [remoteSearchItems, setRemoteSearchItems] = useState<AnalyzeSymbolSearchItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioSyncError, setPortfolioSyncError] = useState<string | null>(null);
  const [deleteTargetKey, setDeleteTargetKey] = useState<string | null>(null);

  const keySet = useMemo(() => new Set(entries.map((e) => entryKey(e))), [entries]);

  const deleteTargetEntry = useMemo(
    () => (deleteTargetKey ? entries.find((e) => entryKey(e) === deleteTargetKey) : undefined),
    [deleteTargetKey, entries],
  );

  useEffect(() => {
    let canceled = false;
    if (authSession === "user") {
      setPortfolioLoading(true);
      setPortfolioSyncError(null);
      void requestStockPortfolio()
        .then((list) => {
          if (canceled) return;
          const dedup = new Map<string, WatchlistEntry>();
          for (const item of list) {
            dedup.set(entryKey(item), {
              market: item.market,
              symbol: item.symbol.trim(),
              name: item.name.trim() || item.symbol.trim(),
            });
          }
          setEntries(Array.from(dedup.values()));
          setPortfolioLoading(false);
        })
        .catch((error: unknown) => {
          if (canceled) return;
          const message = error instanceof Error ? error.message : "同步失败";
          setPortfolioSyncError(message);
          setPortfolioLoading(false);
        });
      return () => {
        canceled = true;
      };
    }

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
          setEntries([...dedup.values()]);
          return () => {
            canceled = true;
          };
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
          setEntries(list);
          window.localStorage.setItem(WATCHLIST_STORAGE_KEY_V2, JSON.stringify(list));
          window.localStorage.removeItem(WATCHLIST_STORAGE_KEY_V1);
        }
      }
    } catch {
      // Ignore invalid local storage payload.
    }
    return () => {
      canceled = true;
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
      description={
        authSession === "user"
          ? "已接入账户自选股接口，增删将实时同步到后端。"
          : "同一搜索框可筛选自选或在匹配结果中回车加入自选；游客模式数据保存在当前浏览器。"
      }
      actions={
        <Button type="button" variant="outline" onClick={() => router.push("/app/analyze")}>
          去预测
        </Button>
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
        <ul
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="自选标的列表"
        >
          {filteredEntries.map((entry) => {
            const k = entryKey(entry);
            const stockCode = `${entry.market}.${entry.symbol}`;
            const q = buildMockBaseQuote(entry.market, entry.symbol);
            const tone = quoteToneClass(q.changePct);
            return (
              <li key={k} className="min-w-0">
                <article className="bg-card relative flex h-full min-h-0 flex-col rounded-xl border p-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground absolute top-2 right-2"
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
                  <div className="flex min-h-0 flex-1 items-end justify-between gap-2 pr-9">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium">{entry.name}</p>
                      <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">
                        {compactBoardCode(entry.market, entry.symbol)}
                      </p>
                    </div>
                    <div className={cn("shrink-0 text-right tabular-nums", tone)}>
                      <p className="text-base font-semibold leading-tight">{q.price.toFixed(2)}</p>
                      <p className="text-sm leading-tight">{formatSignedPct(q.changePct)}</p>
                    </div>
                  </div>
                </article>
              </li>
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
