"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Market } from "@/lib/contracts/domain";
import { buildMockBaseQuote } from "@/lib/mock-base-quote";

const STORAGE_KEY = "zhputian-paper-trading";

/** 起始模拟资金（人民币计价资金池）。 */
export const PAPER_TRADING_STARTING_CASH_CNY = 1_000_000;

/** 将标的本地货币价格折算为人民币的固定系数（仅用于本模块记账）。 */
export function paperTradingFxCnyPerUnit(market: Market): number {
  if (market === "CN") return 1;
  if (market === "HK") return 0.92;
  return 7.2;
}

function positionKey(market: Market, symbol: string) {
  return `${market}.${symbol.trim()}`.toUpperCase();
}

export type PaperPosition = {
  market: Market;
  symbol: string;
  name: string;
  shares: number;
  avgCostLocal: number;
};

export type PaperFill = {
  id: string;
  at: number;
  side: "buy" | "sell";
  market: Market;
  symbol: string;
  name: string;
  shares: number;
  priceLocal: number;
  totalCny: number;
};

type PaperTradingState = {
  cashCny: number;
  positions: PaperPosition[];
  fills: PaperFill[];
  placeBuy: (input: { market: Market; symbol: string; name: string; shares: number }) => { ok: true } | { ok: false; error: string };
  placeSell: (input: { market: Market; symbol: string; shares: number }) => { ok: true } | { ok: false; error: string };
  resetPortfolio: () => void;
};

function findPositionIndex(positions: PaperPosition[], market: Market, symbol: string) {
  const k = positionKey(market, symbol);
  return positions.findIndex((p) => positionKey(p.market, p.symbol) === k);
}

export const usePaperTradingStore = create<PaperTradingState>()(
  persist(
    (set, get) => ({
      cashCny: PAPER_TRADING_STARTING_CASH_CNY,
      positions: [],
      fills: [],
      placeBuy: (input) => {
        const shares = Math.floor(Number(input.shares));
        if (!Number.isFinite(shares) || shares < 1) {
          return { ok: false, error: "股数须为正整数" };
        }
        const market = input.market;
        const symbol = input.symbol.trim();
        if (!symbol) return { ok: false, error: "代码无效" };

        const quote = buildMockBaseQuote(market, symbol);
        const priceLocal = quote.price;
        const fx = paperTradingFxCnyPerUnit(market);
        const totalCny = Number((shares * priceLocal * fx).toFixed(2));

        const { cashCny, positions, fills } = get();
        if (totalCny > cashCny + 1e-6) {
          return { ok: false, error: "可用资金不足" };
        }

        const idx = findPositionIndex(positions, market, symbol);
        const name = input.name.trim() || symbol;
        let nextPositions: PaperPosition[];
        if (idx >= 0) {
          const prev = positions[idx];
          const newShares = prev.shares + shares;
          const newAvg = Number(
            ((prev.avgCostLocal * prev.shares + priceLocal * shares) / newShares).toFixed(4),
          );
          nextPositions = positions.slice();
          nextPositions[idx] = {
            ...prev,
            shares: newShares,
            avgCostLocal: newAvg,
            name: name || prev.name,
          };
        } else {
          nextPositions = [
            ...positions,
            {
              market,
              symbol,
              name,
              shares,
              avgCostLocal: Number(priceLocal.toFixed(4)),
            },
          ];
        }

        const fill: PaperFill = {
          id: crypto.randomUUID(),
          at: Date.now(),
          side: "buy",
          market,
          symbol,
          name,
          shares,
          priceLocal,
          totalCny,
        };

        set({
          cashCny: Number((cashCny - totalCny).toFixed(2)),
          positions: nextPositions,
          fills: [fill, ...fills].slice(0, 500),
        });
        return { ok: true };
      },
      placeSell: (input) => {
        const shares = Math.floor(Number(input.shares));
        if (!Number.isFinite(shares) || shares < 1) {
          return { ok: false, error: "股数须为正整数" };
        }
        const market = input.market;
        const symbol = input.symbol.trim();
        if (!symbol) return { ok: false, error: "代码无效" };

        const { cashCny, positions, fills } = get();
        const idx = findPositionIndex(positions, market, symbol);
        if (idx < 0) return { ok: false, error: "无该标的持仓" };
        const pos = positions[idx];
        if (shares > pos.shares) {
          return { ok: false, error: "卖出数量超过持仓" };
        }

        const quote = buildMockBaseQuote(market, symbol);
        const priceLocal = quote.price;
        const fx = paperTradingFxCnyPerUnit(market);
        const totalCny = Number((shares * priceLocal * fx).toFixed(2));

        const remaining = pos.shares - shares;
        const nextPositions =
          remaining === 0
            ? positions.filter((_, i) => i !== idx)
            : (() => {
                const copy = positions.slice();
                copy[idx] = { ...pos, shares: remaining };
                return copy;
              })();

        const fill: PaperFill = {
          id: crypto.randomUUID(),
          at: Date.now(),
          side: "sell",
          market,
          symbol,
          name: pos.name,
          shares,
          priceLocal,
          totalCny,
        };

        set({
          cashCny: Number((cashCny + totalCny).toFixed(2)),
          positions: nextPositions,
          fills: [fill, ...fills].slice(0, 500),
        });
        return { ok: true };
      },
      resetPortfolio: () =>
        set({
          cashCny: PAPER_TRADING_STARTING_CASH_CNY,
          positions: [],
          fills: [],
        }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        cashCny: s.cashCny,
        positions: s.positions,
        fills: s.fills,
      }),
    },
  ),
);
