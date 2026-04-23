import type { Market } from "./types";
import { ANALYZE_SYMBOL_SAMPLE_UNIVERSE, parseSearchInput } from "./universe";

const KEY = "app-watchlist-v2";

export type WatchlistEntry = {
  market: Market;
  symbol: string;
  name: string;
};

export function entryKey(e: Pick<WatchlistEntry, "market" | "symbol">): string {
  return `${e.market}.${e.symbol}`.toUpperCase();
}

export function loadWatchlist(): WatchlistEntry[] {
  try {
    const raw = wx.getStorageSync(KEY);
    if (!raw || typeof raw !== "string") return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: WatchlistEntry[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (r.market !== "CN" && r.market !== "HK" && r.market !== "US") continue;
      if (typeof r.symbol !== "string" || typeof r.name !== "string") continue;
      const sym = r.symbol.trim();
      if (!sym) continue;
      out.push({ market: r.market as Market, symbol: sym, name: r.name });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveWatchlist(entries: WatchlistEntry[]): void {
  wx.setStorageSync(KEY, JSON.stringify(entries));
}

export function addWatchlistRaw(raw: string, fallbackMarket: Market): { ok: boolean; reason?: string } {
  const parsed = parseSearchInput(raw, fallbackMarket);
  if (!parsed?.symbol?.trim()) return { ok: false, reason: "请输入代码或 CN.600519 形式" };
  const sym = parsed.symbol.trim().toUpperCase();
  const hit =
    ANALYZE_SYMBOL_SAMPLE_UNIVERSE.find((u) => u.symbol.toUpperCase() === sym && u.market === parsed.market) ||
    ANALYZE_SYMBOL_SAMPLE_UNIVERSE.find((u) => u.symbol.toUpperCase() === sym);
  const entry: WatchlistEntry = hit
    ? { market: hit.market, symbol: hit.symbol, name: hit.name }
    : { market: parsed.market, symbol: sym, name: sym };
  const k = entryKey(entry);
  const prev = loadWatchlist();
  if (prev.some((e) => entryKey(e) === k)) return { ok: false, reason: "已在自选列表中" };
  saveWatchlist([entry, ...prev]);
  return { ok: true };
}

export function removeWatchlistEntry(k: string): void {
  saveWatchlist(loadWatchlist().filter((e) => entryKey(e) !== k));
}
