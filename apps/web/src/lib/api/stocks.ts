import type { AnalysisInput } from "@/lib/contracts/domain";
import { getPublicApiBaseUrl } from "@/lib/env";
import type { AnalyzeSymbolSearchItem } from "@/lib/analyze-symbol-search";
import { useAuthStore } from "@/stores/use-auth-store";

type ApiStockSearchItem = {
  code?: string;
  name?: string;
  exchange?: string;
  market?: string;
};

type ApiStockSearchResponse = {
  stocks?: ApiStockSearchItem[];
};

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
