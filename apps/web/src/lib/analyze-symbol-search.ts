import type { AnalysisInput } from "@/lib/contracts/domain";

/** 本地证券池条目；与 analyze 页合并最近记录后用于模糊搜索。 */
export type AnalyzeSymbolSearchItem = {
  key: string;
  market: AnalysisInput["market"];
  symbol: string;
  name: string;
};

export const ANALYZE_SYMBOL_MOCK_UNIVERSE: AnalyzeSymbolSearchItem[] = [
  { key: "CN.600519", market: "CN", symbol: "600519", name: "贵州茅台" },
  { key: "CN.601318", market: "CN", symbol: "601318", name: "中国平安" },
  { key: "CN.000858", market: "CN", symbol: "000858", name: "五粮液" },
  { key: "CN.300750", market: "CN", symbol: "300750", name: "宁德时代" },
  { key: "CN.688981", market: "CN", symbol: "688981", name: "中芯国际" },
  { key: "HK.00700", market: "HK", symbol: "00700", name: "腾讯控股" },
  { key: "HK.09988", market: "HK", symbol: "09988", name: "阿里巴巴-SW" },
  { key: "HK.03690", market: "HK", symbol: "03690", name: "美团-W" },
  { key: "US.AAPL", market: "US", symbol: "AAPL", name: "Apple" },
  { key: "US.MSFT", market: "US", symbol: "MSFT", name: "Microsoft" },
  { key: "US.NVDA", market: "US", symbol: "NVDA", name: "NVIDIA" },
  { key: "US.TSLA", market: "US", symbol: "TSLA", name: "Tesla" },
];

/**
 * 界面展示用「上市板块:代码」。数据层 `market` 仍为 CN/HK/US；A 股按代码前缀映射 SH/SZ/BJ。
 */
export function formatAnalyzeBoardSymbol(market: AnalysisInput["market"], symbol: string): string {
  const sym = symbol.trim();
  if (market === "HK") return `HK:${sym}`;
  if (market === "US") return `US:${sym}`;
  if (/^(43|82|83|87|88|92)/.test(sym)) return `BJ:${sym}`;
  if (/^[69]/.test(sym)) return `SH:${sym}`;
  return `SZ:${sym}`;
}

export function parseAnalyzeSearchInput(raw: string, fallbackMarket: AnalysisInput["market"]) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.match(/^(CN|HK|US)\.(.+)$/i);
  if (prefixed) {
    return {
      market: prefixed[1].toUpperCase() as AnalysisInput["market"],
      symbol: prefixed[2].trim(),
    };
  }
  return { market: fallbackMarket, symbol: trimmed };
}

export function fuzzyAnalyzeSymbolScore(item: AnalyzeSymbolSearchItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const key = `${item.market}.${item.symbol}`.toLowerCase();
  const symbol = item.symbol.toLowerCase();
  const name = item.name.toLowerCase();
  let score = 0;

  if (key === q) score += 140;
  if (symbol === q) score += 130;
  if (name === q) score += 120;

  if (symbol.startsWith(q)) score += 100;
  else if (symbol.includes(q)) score += 76;

  if (name.startsWith(q)) score += 88;
  else if (name.includes(q)) score += 68;

  if (key.startsWith(q)) score += 80;
  else if (key.includes(q)) score += 60;

  return score;
}
