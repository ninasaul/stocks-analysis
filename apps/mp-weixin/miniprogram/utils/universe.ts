import type { Market } from "./types";

export type UniverseItem = {
  key: string;
  market: Market;
  symbol: string;
  name: string;
};

export const ANALYZE_SYMBOL_SAMPLE_UNIVERSE: UniverseItem[] = [
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

export function formatBoardSymbol(market: Market, symbol: string): string {
  const sym = symbol.trim();
  if (market === "HK") return `HK:${sym}`;
  if (market === "US") return `US:${sym}`;
  if (/^(43|82|83|87|88|92)/.test(sym)) return `BJ:${sym}`;
  if (/^[69]/.test(sym)) return `SH:${sym}`;
  return `SZ:${sym}`;
}

export function parseSearchInput(raw: string, fallbackMarket: Market): { market: Market; symbol: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.match(/^(CN|HK|US)\.(.+)$/i);
  if (prefixed) {
    return {
      market: prefixed[1].toUpperCase() as Market,
      symbol: prefixed[2].trim(),
    };
  }
  return { market: fallbackMarket, symbol: trimmed };
}

export function resolveUniverseEntry(raw: string, fallbackMarket: Market): UniverseItem | null {
  const parsed = parseSearchInput(raw, fallbackMarket);
  if (!parsed?.symbol) return null;
  const sym = parsed.symbol.trim().toUpperCase();
  const hit = ANALYZE_SYMBOL_SAMPLE_UNIVERSE.find(
    (u) => u.symbol.toUpperCase() === sym && u.market === parsed.market
  );
  if (hit) return hit;
  const hitAny = ANALYZE_SYMBOL_SAMPLE_UNIVERSE.find((u) => u.symbol.toUpperCase() === sym);
  if (hitAny) return hitAny;
  if (!sym) return null;
  return { key: `${parsed.market}.${sym}`, market: parsed.market, symbol: sym, name: sym };
}
