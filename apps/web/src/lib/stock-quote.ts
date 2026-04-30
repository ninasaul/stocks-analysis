export type StockQuote = {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volume: number | null;
  amount: number | null;
  updateTime: string | null;
  source: string | null;
  cachedAt: number;
};

export function isStockQuote(value: unknown): value is StockQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as Partial<StockQuote>;
  return (
    typeof quote.stockCode === "string" &&
    typeof quote.stockName === "string" &&
    typeof quote.currentPrice === "number" &&
    quote.currentPrice > 0 &&
    typeof quote.change === "number" &&
    typeof quote.changePercent === "number" &&
    typeof quote.cachedAt === "number"
  );
}
