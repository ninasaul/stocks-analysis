import { type NextRequest, NextResponse } from "next/server";
import { normalizeCnSixDigitSymbol, tryResolveEastMoneyStockQuote } from "@/lib/server/eastmoney-snapshot";
import { getServerCachedQuoteResult } from "@/lib/server/stock-quote-server-cache";

/** A 股快照：东方财富 push2 + 进程内 TTL 缓存与同源 in-flight 合并。 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ stockCode: string }> },
) {
  const auth = request.headers.get("authorization")?.trim();
  if (!auth) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const { stockCode: stockCodeParam } = await context.params;
  const raw = decodeURIComponent(stockCodeParam).trim();
  const six = normalizeCnSixDigitSymbol(raw);
  if (!six) {
    return NextResponse.json({ detail: "仅支持沪深 6 位 A 股代码" }, { status: 400 });
  }

  const bypassCache = request.nextUrl.searchParams.get("fresh") === "1";

  const outcome = await getServerCachedQuoteResult(
    six,
    async () => {
      const { quote, eastMoneyRespondedOk } = await tryResolveEastMoneyStockQuote(six);
      if (quote) return { type: "quote" as const, quote };
      if (!eastMoneyRespondedOk) return { type: "upstream_fail" as const };
      return { type: "no_quote" as const };
    },
    { bypassCache },
  );

  if (outcome.type === "upstream_fail") {
    return NextResponse.json({ detail: "行情源暂不可用" }, { status: 502 });
  }
  if (outcome.type === "no_quote") {
    return NextResponse.json({ detail: "暂无有效报价（可能休市或未交易）" }, { status: 404 });
  }

  return NextResponse.json(outcome.quote);
}
