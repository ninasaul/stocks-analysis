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
