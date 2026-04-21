import type { AnalysisInput } from "@/lib/contracts/domain";

/** 与股票预测页一致的本地推算行情（确定性种子）。 */
export type MockBaseQuote = {
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  updatedAt: number;
};

export function hashCode(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function quoteCurrencyLabel(market: AnalysisInput["market"]) {
  if (market === "HK") return "HK$";
  if (market === "US") return "US$";
  return "CNY";
}

export function buildMockBaseQuote(market: AnalysisInput["market"], symbol: string): MockBaseQuote {
  const key = `${market}.${symbol}`;
  const seed = hashCode(key);
  const anchor = market === "US" ? 120 : market === "HK" ? 260 : 85;
  const price = Number((anchor + (seed % 3000) / 37).toFixed(2));
  const drift = ((seed % 900) - 450) / 10000;
  const changePct = Number((drift * 100).toFixed(2));
  const change = Number((price * drift).toFixed(2));
  const open = Number((price - change * 0.6).toFixed(2));
  const high = Number((Math.max(price, open) * 1.008).toFixed(2));
  const low = Number((Math.min(price, open) * 0.992).toFixed(2));
  const volume = 8_000_000 + (seed % 40_000_000);
  const turnover = Number((volume * price).toFixed(0));
  return {
    price,
    change,
    changePct,
    open,
    high,
    low,
    volume,
    turnover,
    updatedAt: Date.now(),
  };
}
