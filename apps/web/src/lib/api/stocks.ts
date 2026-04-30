import type { AnalysisInput } from "@/lib/contracts/domain";
import { getPublicApiBaseUrl } from "@/lib/env";
import type { AnalyzeSymbolSearchItem } from "@/lib/analyze-symbol-search";
import { type StockQuote, isStockQuote } from "@/lib/stock-quote";
import { useAuthStore } from "@/stores/use-auth-store";

/** 同源 Next Route：东方财富快照（服务端拉取）。`fresh=1` 时跳过服务端内存与 CSV，仍写入新缓存。 */
function quoteUrlPath(stockCode: string, bypassServerCache: boolean) {
  const base = `/api/stocks/${encodeURIComponent(stockCode)}/quote`;
  return bypassServerCache ? `${base}?fresh=1` : base;
}

export type RequestStockQuoteOptions = {
  /** 跳过浏览器侧 TTL 缓存，并附带 `fresh=1` 拉最新快照 */
  force?: boolean;
};

type ApiStockSearchItem = {
  code?: string;
  name?: string;
  exchange?: string;
  market?: string;
};

type ApiStockSearchResponse = {
  stocks?: ApiStockSearchItem[];
};

type ApiPortfolioStock = {
  id?: number;
  stock_code?: string;
  stock_name?: string;
  exchange?: string | null;
  market?: string | null;
  added_date?: string | null;
};

type ApiPortfolioListResponse = {
  stocks?: ApiPortfolioStock[];
};

type ApiPortfolioMutationResponse = {
  success?: boolean;
  data?: ApiPortfolioStock;
};

export type { StockQuote };

const STOCK_QUOTE_CACHE_KEY = "app-stock-quotes-v1";
/** 与 `getCachedStockQuote` / 自选自动刷新阈值一致（毫秒）。 */
export const STOCK_QUOTE_CLIENT_CACHE_TTL_MS = 30 * 60 * 1000;
const STOCK_QUOTE_CACHE_TTL_MS = STOCK_QUOTE_CLIENT_CACHE_TTL_MS;
const stockQuoteMemoryCache = new Map<string, StockQuote>();

function normalizeStockCode(value: string) {
  return value.trim().toUpperCase();
}

function isFreshQuote(quote: StockQuote, now = Date.now()) {
  return now - quote.cachedAt < STOCK_QUOTE_CACHE_TTL_MS;
}

function writeCachedStockQuote(quote: StockQuote) {
  const key = normalizeStockCode(quote.stockCode);
  stockQuoteMemoryCache.set(key, quote);
  if (typeof window === "undefined") return;
  try {
    const cache = readStockQuoteStorage();
    cache[key] = quote;
    window.localStorage.setItem(STOCK_QUOTE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore localStorage write failures; the in-memory cache still works for this session.
  }
}

function readStockQuoteStorage(): Record<string, StockQuote> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STOCK_QUOTE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const cache: Record<string, StockQuote> = {};
    let changed = false;
    for (const [key, value] of Object.entries(parsed)) {
      if (isStockQuote(value)) {
        cache[normalizeStockCode(key)] = value;
      } else {
        changed = true;
      }
    }
    if (changed) {
      window.localStorage.setItem(STOCK_QUOTE_CACHE_KEY, JSON.stringify(cache));
    }
    return cache;
  } catch {
    return {};
  }
}

export function getStoredStockQuote(stockCode: string): StockQuote | null {
  const key = normalizeStockCode(stockCode);
  const memoryHit = stockQuoteMemoryCache.get(key);
  if (memoryHit) return memoryHit;

  const storageHit = readStockQuoteStorage()[key];
  if (storageHit) {
    stockQuoteMemoryCache.set(key, storageHit);
    return storageHit;
  }
  return null;
}

function getCachedStockQuote(stockCode: string): StockQuote | null {
  const key = normalizeStockCode(stockCode);
  const memoryHit = getStoredStockQuote(key);
  if (memoryHit && isFreshQuote(memoryHit)) return memoryHit;

  const storageHit = readStockQuoteStorage()[key];
  if (storageHit && isFreshQuote(storageHit)) {
    stockQuoteMemoryCache.set(key, storageHit);
    return storageHit;
  }
  return null;
}

function toAnalyzeMarket(item: ApiStockSearchItem): AnalysisInput["market"] {
  const market = (item.market ?? "").trim().toUpperCase();
  if (market === "A股") return "CN";
  if (market === "港股") return "HK";
  if (market === "美股") return "US";

  const exchange = (item.exchange ?? "").trim().toUpperCase();
  if (exchange === "SH" || exchange === "SZ" || exchange === "BJ") return "CN";
  if (exchange === "HK") return "HK";
  if (exchange === "US" || exchange === "NASDAQ" || exchange === "NYSE" || exchange === "AMEX") return "US";

  return "CN";
}

function normalizePortfolioMarket(item: Pick<ApiPortfolioStock, "market" | "exchange">): AnalysisInput["market"] {
  const market = (item.market ?? "").trim().toUpperCase();
  if (market === "CN" || market === "A股") return "CN";
  if (market === "HK" || market === "港股") return "HK";
  if (market === "US" || market === "美股") return "US";

  const exchange = (item.exchange ?? "").trim().toUpperCase();
  if (exchange === "SH" || exchange === "SZ" || exchange === "BJ") return "CN";
  if (exchange === "HK") return "HK";
  if (exchange === "US" || exchange === "NASDAQ" || exchange === "NYSE" || exchange === "AMEX") return "US";
  return "CN";
}

export async function requestStockSearch(keyword: string, limit = 6): Promise<AnalyzeSymbolSearchItem[]> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return [];

  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) return [];

  const url = new URL("/api/stocks/search", getPublicApiBaseUrl());
  url.searchParams.set("keyword", normalizedKeyword);
  url.searchParams.set("limit", String(limit));

  const response = await state.authenticatedFetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`搜索股票失败（${response.status}）`);
  }

  const payload = (await response.json()) as ApiStockSearchResponse;
  const items = Array.isArray(payload.stocks) ? payload.stocks : [];

  return items
    .map((item) => {
      const symbol = String(item.code ?? "").trim();
      const name = String(item.name ?? "").trim() || symbol;
      if (!symbol) return null;
      const market = toAnalyzeMarket(item);
      return {
        key: `${market}.${symbol}`,
        market,
        symbol,
        name,
      } satisfies AnalyzeSymbolSearchItem;
    })
    .filter((item): item is AnalyzeSymbolSearchItem => item !== null);
}

export async function requestStockPortfolio(): Promise<
  Array<{ market: AnalysisInput["market"]; symbol: string; name: string }>
> {
  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) return [];

  const url = new URL("/api/stocks/portfolio", getPublicApiBaseUrl());
  const response = await state.authenticatedFetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`获取自选股失败（${response.status}）`);
  }

  const payload = (await response.json()) as ApiPortfolioListResponse;
  const items = Array.isArray(payload.stocks) ? payload.stocks : [];
  return items
    .map((item) => {
      const symbol = String(item.stock_code ?? "").trim();
      if (!symbol) return null;
      return {
        market: normalizePortfolioMarket(item),
        symbol,
        name: String(item.stock_name ?? "").trim() || symbol,
      };
    })
    .filter((item): item is { market: AnalysisInput["market"]; symbol: string; name: string } => item !== null);
}

export async function requestAddStockPortfolio(input: {
  symbol: string;
  name: string;
  market: AnalysisInput["market"];
  exchange?: string;
}): Promise<void> {
  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) {
    throw new Error("当前未登录，请先登录后重试");
  }
  const symbol = input.symbol.trim();
  if (!symbol) throw new Error("股票代码不能为空");

  const url = new URL("/api/stocks/portfolio", getPublicApiBaseUrl());
  const response = await state.authenticatedFetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stock_code: symbol,
      stock_name: input.name.trim() || symbol,
      market: input.market,
      exchange: input.exchange?.trim() || undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(`添加自选股失败（${response.status}）`);
  }
  const payload = (await response.json()) as ApiPortfolioMutationResponse;
  if (payload.success === false) {
    throw new Error("添加自选股失败");
  }
}

export async function requestDeleteStockPortfolio(symbol: string): Promise<void> {
  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) {
    throw new Error("当前未登录，请先登录后重试");
  }
  const normalized = symbol.trim();
  if (!normalized) return;

  const url = new URL(`/api/stocks/portfolio/${encodeURIComponent(normalized)}`, getPublicApiBaseUrl());
  const response = await state.authenticatedFetch(url.toString(), { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`删除自选股失败（${response.status}）`);
  }
}

/** 服务端东方财富快照 + 本地短缓存（与后端 FastAPI 无关）。 */
export async function requestStockQuote(
  stockCode: string,
  options?: RequestStockQuoteOptions,
): Promise<StockQuote | null> {
  const normalized = normalizeStockCode(stockCode);
  if (!normalized) return null;

  const force = options?.force === true;

  if (!force) {
    const cached = getCachedStockQuote(normalized);
    if (cached) return cached;
  }

  const state = useAuthStore.getState();
  if (state.session !== "user" || !state.accessToken) return null;

  const response = await state.authenticatedFetch(quoteUrlPath(normalized, force), {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`获取行情失败（${response.status}）`);
  }

  const data: unknown = await response.json();
  if (!isStockQuote(data)) {
    throw new Error("行情数据格式异常");
  }
  writeCachedStockQuote(data);
  return data;
}
