"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartLineIcon, EllipsisVerticalIcon, SearchIcon, Trash2Icon } from "lucide-react";
import type { AnalysisInput } from "@/lib/contracts/domain";
import {
  ANALYZE_SYMBOL_MOCK_UNIVERSE,
  formatAnalyzeBoardSymbol,
  fuzzyAnalyzeSymbolScore,
  parseAnalyzeSearchInput,
  type AnalyzeSymbolSearchItem,
} from "@/lib/analyze-symbol-search";
import { buildMockBaseQuote } from "@/lib/mock-base-quote";
import { AppPageLayout } from "@/components/features/app-page-layout";
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

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
  const parsed = parseAnalyzeSearchInput(raw, fallbackMarket);
  if (!parsed?.symbol) return null;
  const sym = parsed.symbol.trim();
  if (!sym) return null;
  const market = parsed.market;
  const hitPreferred = ANALYZE_SYMBOL_MOCK_UNIVERSE.find(
    (u) => u.symbol.toLowerCase() === sym.toLowerCase() && u.market === market,
  );
  if (hitPreferred) return universeItemToEntry(hitPreferred);
  const hitAny = ANALYZE_SYMBOL_MOCK_UNIVERSE.find((u) => u.symbol.toLowerCase() === sym.toLowerCase());
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

/** A 股常用配色：涨红跌绿；零轴为中性灰。 */
function quoteToneClass(changePct: number) {
  if (changePct > 0) return "text-red-600 dark:text-red-500";
  if (changePct < 0) return "text-emerald-600 dark:text-emerald-500";
  return "text-muted-foreground";
}

export default function WatchlistPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);

  const keySet = useMemo(() => new Set(entries.map((e) => entryKey(e))), [entries]);

  useEffect(() => {
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
          setEntries(list);
          window.localStorage.setItem(WATCHLIST_STORAGE_KEY_V2, JSON.stringify(list));
          window.localStorage.removeItem(WATCHLIST_STORAGE_KEY_V1);
        }
      }
    } catch {
      // Ignore invalid local storage payload.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY_V2, JSON.stringify(entries));
    } catch {
      // Ignore local storage write failures.
    }
  }, [entries]);

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
    if (!q) return [];
    return ANALYZE_SYMBOL_MOCK_UNIVERSE.filter((u) => !keySet.has(entryKey(u)))
      .map((u) => ({ u, score: fuzzyAnalyzeSymbolScore(u, q) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((row) => row.u);
  }, [keySet, q]);

  const addEntry = useCallback((entry: WatchlistEntry) => {
    const k = entryKey(entry);
    setEntries((prev) => {
      if (prev.some((e) => entryKey(e) === k)) return prev;
      return [entry, ...prev];
    });
    setQuery("");
  }, []);

  const removeEntry = useCallback((k: string) => {
    setEntries((prev) => prev.filter((e) => entryKey(e) !== k));
  }, []);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!q) return;
    const resolved = tryResolveEntryFromRaw(q, "CN");
    if (resolved) addEntry(resolved);
  };

  const listEmpty = entries.length === 0;
  const filterEmpty = !listEmpty && q.length > 0 && filteredEntries.length === 0;

  return (
    <AppPageLayout
      title="自选"
      description="同一搜索框可筛选自选或在匹配结果中回车加入自选；数据保存在当前浏览器。"
      actions={
        <Button variant="outline" render={<Link href="/app/analyze" />}>
          去预测
        </Button>
      }
      contentClassName="gap-4"
    >
      <div className="shrink-0">
        <InputGroup className="bg-background">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="代码或名称模糊搜索；回车按输入加入自选"
            aria-label="自选模糊搜索"
            autoComplete="off"
          />
        </InputGroup>
      </div>

      {addSuggestions.length > 0 ? (
        <section aria-label="可加入自选的匹配标的" className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium">可加入自选</p>
          <ul className="flex flex-col gap-1 rounded-lg border bg-card p-1">
            {addSuggestions.map((u) => (
              <li key={u.key}>
                <button
                  type="button"
                  className={cn(
                    "hover:bg-muted/80 flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                  )}
                  onClick={() => addEntry(universeItemToEntry(u))}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-muted-foreground ml-2 tabular-nums">
                      {compactBoardCode(u.market, u.symbol)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
                        <DropdownMenuItem variant="destructive" onClick={() => removeEntry(k)}>
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
    </AppPageLayout>
  );
}
