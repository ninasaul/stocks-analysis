import fs from "node:fs/promises";
import path from "node:path";

import type { StockQuote } from "@/lib/stock-quote";

const HEADER =
  "stock_code,stock_name,current_price,change,change_percent,open,high,low,prev_close,volume,amount,update_time,source,cached_at";

const MAX_ROWS = 800;

/** 串行化写盘，避免并发写坏文件。 */
let writeQueue: Promise<void> = Promise.resolve();

export function isStockQuoteCsvStoreEnabled(): boolean {
  const d = process.env.STOCK_QUOTE_CSV_DISABLE?.trim().toLowerCase();
  return d !== "1" && d !== "true" && d !== "yes";
}

export function stockQuoteCsvPath(): string {
  const raw = process.env.STOCK_QUOTE_CSV_PATH?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  }
  return path.join(process.cwd(), ".data", "stock-quotes-cache.csv");
}

function safeName(name: string) {
  return name.replace(/,/g, " ").replace(/\r?\n/g, " ").trim();
}

function numOrEmpty(n: number | null) {
  return n === null || n === undefined || Number.isNaN(n) ? "" : String(n);
}

function rowFromQuote(q: StockQuote): string {
  return [
    q.stockCode,
    safeName(q.stockName),
    String(q.currentPrice),
    String(q.change),
    String(q.changePercent),
    numOrEmpty(q.open),
    numOrEmpty(q.high),
    numOrEmpty(q.low),
    numOrEmpty(q.prevClose),
    numOrEmpty(q.volume),
    numOrEmpty(q.amount),
    q.updateTime ?? "",
    q.source ?? "",
    String(q.cachedAt),
  ].join(",");
}

function parseRow(cols: string[]): StockQuote | null {
  if (cols.length < 14) return null;
  const [
    stockCode,
    stockName,
    cur,
    chg,
    chgPct,
    op,
    hi,
    lo,
    prev,
    vol,
    amt,
    updateTime,
    source,
    cachedAt,
  ] = cols;

  const currentPrice = Number(cur);
  const change = Number(chg);
  const changePercent = Number(chgPct);
  const cached = Number(cachedAt);
  if (
    !stockCode ||
    !stockName ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(change) ||
    !Number.isFinite(changePercent) ||
    !Number.isFinite(cached)
  ) {
    return null;
  }

  const opt = (s: string) => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  return {
    stockCode: stockCode.trim().padStart(6, "0").slice(-6),
    stockName: stockName.trim(),
    currentPrice,
    change,
    changePercent,
    open: opt(op),
    high: opt(hi),
    low: opt(lo),
    prevClose: opt(prev),
    volume: opt(vol),
    amount: opt(amt),
    updateTime: updateTime.trim() || null,
    source: source.trim() || null,
    cachedAt: cached,
  };
}

function splitCsvLine(line: string): string[] {
  return line.split(",");
}

async function readAllQuotesFromFile(filePath: string): Promise<Map<string, StockQuote>> {
  const map = new Map<string, StockQuote>();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return map;
    throw e;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return map;
  if (!lines[0].startsWith("stock_code")) {
    return map;
  }
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const q = parseRow(cols);
    if (q) map.set(q.stockCode, q);
  }
  return map;
}

/** 若磁盘上该代码仍在 TTL 内，返回报价。 */
export async function readFreshQuoteFromCsv(
  sixDigit: string,
  ttlMs: number,
  now: number,
): Promise<StockQuote | null> {
  if (!isStockQuoteCsvStoreEnabled()) return null;
  const key = sixDigit.replace(/\D/g, "").padStart(6, "0").slice(-6);
  try {
    const map = await readAllQuotesFromFile(stockQuoteCsvPath());
    const q = map.get(key);
    if (!q) return null;
    if (now - q.cachedAt >= ttlMs) return null;
    return q;
  } catch {
    return null;
  }
}

export function upsertQuoteToCsv(quote: StockQuote): void {
  if (!isStockQuoteCsvStoreEnabled()) return;
  const filePath = stockQuoteCsvPath();
  writeQueue = writeQueue.then(() => doUpsert(filePath, quote)).catch(() => {});
}

async function doUpsert(filePath: string, quote: StockQuote): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const map = await readAllQuotesFromFile(filePath);
  map.set(quote.stockCode, quote);

  const sorted = [...map.values()].sort((a, b) => a.cachedAt - b.cachedAt);
  while (sorted.length > MAX_ROWS) sorted.shift();

  const body = sorted.map(rowFromQuote).join("\n");
  const contents = `${HEADER}\n${body}\n`;

  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, contents, "utf8");
  await fs.rename(tmp, filePath);
}
