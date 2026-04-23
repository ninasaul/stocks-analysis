import type { Market } from "./types";

export type SampleBaseQuote = {
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

export function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function buildSampleBaseQuote(market: Market, symbol: string): SampleBaseQuote {
  const key = `${market}.${symbol}`;
  const seed = hashCode(key);
  const anchor = market === "US" ? 165 : market === "HK" ? 210 : 42;
  const price = Number((anchor + (seed % 2400) / 33).toFixed(2));
  const drift = ((seed % 700) - 350) / 10000;
  const changePct = Number((drift * 100).toFixed(2));
  const change = Number((price * drift).toFixed(2));
  const open = Number((price - change * 0.72).toFixed(2));
  const high = Number((Math.max(price, open) * 1.011).toFixed(2));
  const low = Number((Math.min(price, open) * 0.989).toFixed(2));
  const volume = 9_000_000 + (seed % 36_000_000);
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
