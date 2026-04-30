import type { StockQuote } from "@/lib/stock-quote";

import {
  readFreshQuoteFromCsv,
  upsertQuoteToCsv,
} from "@/lib/server/stock-quote-csv-store";

/** 环境变量 `STOCK_QUOTE_SERVER_TTL_MS`（3000–600000，默认 30000）控制内存/CSV 新鲜度。 */

export type ServerQuoteFetchResult =
  | { type: "quote"; quote: StockQuote }
  | { type: "upstream_fail" }
  | { type: "no_quote" };

const MAX_KEYS = 800;

const quoteCache = new Map<string, { expires: number; quote: StockQuote }>();
const inflight = new Map<string, Promise<ServerQuoteFetchResult>>();

function ttlMs(): number {
  const raw = process.env.STOCK_QUOTE_SERVER_TTL_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 3000 && n <= 600_000 ? n : 30_000;
}

function evictIfNeeded() {
  if (quoteCache.size < MAX_KEYS) return;
  const oldest = quoteCache.keys().next().value;
  if (oldest !== undefined) quoteCache.delete(oldest);
}

/**
 * 按 6 位代码合并请求并缓存成功的快照，减少对东方财富等设施的压力。
 */
export async function getServerCachedQuoteResult(
  sixDigit: string,
  fetchFresh: () => Promise<ServerQuoteFetchResult>,
  options?: { bypassCache?: boolean },
): Promise<ServerQuoteFetchResult> {
  const bypass = options?.bypassCache === true;
  const tick = ttlMs();
  const now = Date.now();

  if (bypass) {
    const result = await fetchFresh();
    if (result.type === "quote") {
      evictIfNeeded();
      const expiresAt = result.quote.cachedAt + tick;
      quoteCache.set(sixDigit, { expires: expiresAt, quote: result.quote });
      upsertQuoteToCsv(result.quote);
    }
    return result;
  }

  const hit = quoteCache.get(sixDigit);
  if (hit && hit.expires > now) {
    return { type: "quote", quote: hit.quote };
  }

  const pending = inflight.get(sixDigit);
  if (pending) return pending;

  const fromDisk = await readFreshQuoteFromCsv(sixDigit, tick, now);
  if (fromDisk) {
    const expiresAt = fromDisk.cachedAt + tick;
    quoteCache.set(sixDigit, { expires: expiresAt, quote: fromDisk });
    return { type: "quote", quote: fromDisk };
  }

  const promise = (async (): Promise<ServerQuoteFetchResult> => {
    try {
      const result = await fetchFresh();
      if (result.type === "quote") {
        evictIfNeeded();
        const expiresAt = result.quote.cachedAt + tick;
        quoteCache.set(sixDigit, { expires: expiresAt, quote: result.quote });
        upsertQuoteToCsv(result.quote);
      }
      return result;
    } finally {
      inflight.delete(sixDigit);
    }
  })();

  inflight.set(sixDigit, promise);
  return promise;
}
