"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const WATCHLIST_STORAGE_KEY = "app-watchlist-symbols";

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

export default function WatchlistPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const normalizedDraft = useMemo(() => normalizeSymbol(draft), [draft]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const next = parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeSymbol(item))
        .filter(Boolean);
      setSymbols(Array.from(new Set(next)));
    } catch {
      // Ignore invalid local storage payload.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(symbols));
    } catch {
      // Ignore local storage write failures.
    }
  }, [symbols]);

  const handleAddSymbol = () => {
    const next = normalizedDraft;
    if (!next) return;
    setSymbols((prev) => (prev.includes(next) ? prev : [next, ...prev]));
    setDraft("");
  };

  return (
    <AppPageLayout
      title="自选"
      description="维护重点观察标的，便于快速进入股票预测与后续跟踪。"
      actions={
        <Button variant="outline" render={<Link href="/app/analyze" />}>
          去预测
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>添加标的</CardTitle>
          <CardDescription>输入证券代码后加入自选列表。系统会自动转为大写。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例如：600519 或 AAPL"
            aria-label="输入证券代码"
            maxLength={24}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              handleAddSymbol();
            }}
          />
          <Button type="button" onClick={handleAddSymbol} disabled={!normalizedDraft}>
            <PlusIcon />
            加入自选
          </Button>
        </CardContent>
      </Card>

      {symbols.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>暂无自选标的</EmptyTitle>
            <EmptyDescription>先添加你关注的证券代码，自选列表会在当前设备自动保存。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>自选列表</CardTitle>
            <CardDescription>共 {symbols.length} 个标的，可逐个删除并快速进入股票预测。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {symbols.map((symbol) => (
              <div key={symbol} className="bg-muted/30 flex items-center gap-1 rounded-md border px-2 py-1">
                <Badge variant="secondary" className="tabular-nums">
                  {symbol}
                </Badge>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`移除 ${symbol}`}
                  onClick={() => setSymbols((prev) => prev.filter((item) => item !== symbol))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </AppPageLayout>
  );
}
