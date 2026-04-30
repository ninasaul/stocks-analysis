import type { StockQuote } from "@/lib/stock-quote";

const EASTMONEY_QT_URL = "https://push2.eastmoney.com/api/qt/stock/get";
const EASTMONEY_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function normalizeSixDigits(normalizedSixDigit: string): string | null {
  const code = normalizedSixDigit.replace(/\D/g, "").padStart(6, "0").slice(-6);
  return /^\d{6}$/.test(code) ? code : null;
}

/** 上交所常见：主板/科创 `6`、`588` ETF、部分沪市基金段；其余走深交所 `0.`。 */
function primarySecMarketPrefix(code: string): "1" | "0" {
  if (code.startsWith("6")) return "1";
  if (/^588|^563|^561|^560|^51[058]|^517|^518|^512/.test(code)) return "1";
  return "0";
}

function flipMarketPrefix(secid: string): string {
  const [m, ...rest] = secid.split(".");
  const code = rest.join(".");
  if (m !== "0" && m !== "1") return secid;
  return `${m === "1" ? "0" : "1"}.${code}`;
}

/** secid：`1`=上交所，`0`=深交所（北交所等对东方财富不完整）。 */
export function eastMoneySecId(normalizedSixDigit: string): string | null {
  const code = normalizeSixDigits(normalizedSixDigit);
  if (!code) return null;
  return `${primarySecMarketPrefix(code)}.${code}`;
}

function orderedSecIdsToTry(normalizedSixDigit: string): string[] {
  const code = normalizeSixDigits(normalizedSixDigit);
  if (!code) return [];
  const primary = `${primarySecMarketPrefix(code)}.${code}`;
  const alt = flipMarketPrefix(primary);
  return primary === alt ? [primary] : [primary, alt];
}

/**
 * 依次尝试上交所/深交所 secid；若东方财富返回过有效 JSON body 却仍无现价，归为 halted。
 */
export async function tryResolveEastMoneyStockQuote(normalizedSix: string): Promise<{
  quote: StockQuote | null;
  eastMoneyRespondedOk: boolean;
}> {
  let eastMoneyRespondedOk = false;
  for (const secid of orderedSecIdsToTry(normalizedSix)) {
    const row = await fetchEastMoneySnapshotJson(secid);
    if (!row) continue;
    eastMoneyRespondedOk = true;
    const q = eastMoneyRowToStockQuote(normalizedSix, row);
    if (q) return { quote: q, eastMoneyRespondedOk };
  }
  return { quote: null, eastMoneyRespondedOk };
}

export function normalizeCnSixDigitSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  const shsz = s.match(/^(?:SH|SZ|BJ)?(\d{6})$/);
  if (shsz) return shsz[1];
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 6) return digits.slice(-6);
  if (digits.length > 0) return digits.padStart(6, "0");
  return null;
}

function numField(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").trim();
    if (!t || t === "-") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type EastMoneyGetJson = {
  rc?: number;
  data?: Record<string, unknown> | null;
};

export async function fetchEastMoneySnapshotJson(secid: string): Promise<Record<string, unknown> | null> {
  const url = new URL(EASTMONEY_QT_URL);
  url.searchParams.set("ut", "fa5fd1943c7b386f172d6893dbfba10b");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fltt", "2");
  url.searchParams.set("secid", secid);
  url.searchParams.set("fields", "f57,f58,f43,f44,f45,f46,f47,f48,f60,f169,f170");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": EASTMONEY_UA,
      Accept: "application/json,text/plain,*/*",
      Referer: "https://quote.eastmoney.com/",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as EastMoneyGetJson;
  if (json.rc !== 0 || !json.data || typeof json.data !== "object") return null;
  return json.data;
}

export function eastMoneyRowToStockQuote(sixDigit: string, row: Record<string, unknown>): StockQuote | null {
  const currentPrice = numField(row.f43);
  /** 停牌/集合竞价时段常见 "-"，仍可展示现价，涨跌按 0 处理。 */
  const changeRaw = numField(row.f169);
  const pctRaw = numField(row.f170);
  const change = changeRaw ?? 0;
  const changePercent = pctRaw ?? 0;
  const prevClose = numField(row.f60);

  if (currentPrice === null || currentPrice <= 0) return null;

  const codeRaw = String(row.f57 ?? sixDigit).trim();
  const stockCode = codeRaw.replace(/\D/g, "").padStart(6, "0").slice(-6) || sixDigit;
  const stockName = String(row.f58 ?? "").trim() || stockCode;

  return {
    stockCode,
    stockName,
    currentPrice,
    change,
    changePercent,
    open: numField(row.f46),
    high: numField(row.f44),
    low: numField(row.f45),
    prevClose,
    volume: numField(row.f47),
    amount: numField(row.f48),
    updateTime: new Date().toISOString(),
    source: "eastmoney.push2.qt",
    cachedAt: Date.now(),
  };
}
