"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useArchiveStore } from "@/stores/use-archive-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageLoadingState } from "@/components/features/page-state";
import { cn } from "@/lib/utils";

const actionLabels: Record<string, string> = {
  wait: "观望",
  trial: "试仓",
  add: "加仓",
  reduce: "减仓",
  exit: "离场",
};

const riskLabels: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const timeframeLabels: Record<string, string> = {
  daily: "日线",
  weekly: "周线",
};

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatPricePlain(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export default function HistoryDetailPage() {
  const archiveHydrated = useStoreHydrated(useArchiveStore);
  const archives = useArchiveStore((s) => s.archives);
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const entry = useMemo(() => archives.find((archive) => archive.id === id), [archives, id]);
  const entryIndex = useMemo(() => archives.findIndex((archive) => archive.id === id), [archives, id]);
  const newerEntry = entryIndex > 0 ? archives[entryIndex - 1] : null;
  const olderEntry = entryIndex >= 0 && entryIndex < archives.length - 1 ? archives[entryIndex + 1] : null;
  const hydrated = archiveHydrated;

  if (!hydrated) {
    return (
      <AppPageLayout title="存档详情" description="查看单条存档的结论与执行计划。">
        <PageLoadingState title="正在加载存档详情" description="请稍候，正在同步记录内容。" />
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout
      title="存档详情"
      description="查看单条存档的结论、风险边界与执行计划。"
      actions={
        <>
          <Button variant="outline" size="sm" render={<Link href="/app/history" />}>
            返回列表
          </Button>
          {olderEntry ? (
            <Button variant="outline" size="sm" render={<Link href={`/app/history/${olderEntry.id}`} />}>
              上一条
            </Button>
          ) : null}
          {newerEntry ? (
            <Button variant="outline" size="sm" render={<Link href={`/app/history/${newerEntry.id}`} />}>
              下一条
            </Button>
          ) : null}
        </>
      }
    >
      {!entry ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>未找到记录</EmptyTitle>
            <EmptyDescription>该记录不存在或已被清理，请返回列表重新选择。</EmptyDescription>
          </EmptyHeader>
          <Button render={<Link href="/app/history" />}>返回列表</Button>
        </Empty>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="bg-muted/25 rounded-xl border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs sm:text-sm">
                {entry.market}.{entry.symbol}
              </Badge>
              <Badge variant="secondary">{timeframeLabels[entry.timeframe] ?? entry.timeframe}</Badge>
              <Badge variant="secondary">{riskLabels[entry.risk_level] ?? entry.risk_level}</Badge>
              <Badge variant="outline" className="tabular-nums">
                置信 {entry.confidence}
              </Badge>
              {entry.plan_metrics ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "tabular-nums",
                    entry.plan_metrics.expected_return_pct > 0 && "border-emerald-500/50 text-emerald-700 dark:text-emerald-400",
                    entry.plan_metrics.expected_return_pct < 0 && "border-red-500/50 text-red-700 dark:text-red-400",
                  )}
                >
                  预期盈利率{" "}
                  {entry.plan_metrics.expected_return_pct > 0 ? "+" : ""}
                  {entry.plan_metrics.expected_return_pct.toFixed(1)}%
                </Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">数据版本 {entry.data_version}</p>
          </div>
          <Card className="shadow-none">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="text-lg leading-snug sm:text-xl">{entry.title}</CardTitle>
              <CardDescription>{formatDate(entry.created_at)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>{actionLabels[entry.action] ?? entry.action}</Badge>
                <Badge variant="outline">风险层级 {riskLabels[entry.risk_level] ?? entry.risk_level}</Badge>
                <Badge variant="outline">分析时间 {timeframeLabels[entry.timeframe] ?? entry.timeframe}</Badge>
                <Badge variant={entry.gate_downgraded ? "destructive" : "secondary"}>
                  {entry.gate_downgraded ? "门控已降级" : "门控通过"}
                </Badge>
              </div>
              {entry.gate_downgraded && entry.gate_reason ? (
                <Alert variant="destructive">
                  <AlertTitle>降级原因</AlertTitle>
                  <AlertDescription>{entry.gate_reason}</AlertDescription>
                </Alert>
              ) : null}
              <Separator />
              <section className="flex flex-col gap-2">
                <h2 className="text-foreground text-sm font-semibold tracking-tight">结论说明</h2>
                <p className="text-muted-foreground leading-relaxed">{entry.action_reason}</p>
              </section>
              <Separator />
              <section className="flex flex-col gap-3">
                <h2 className="text-foreground text-sm font-semibold tracking-tight">执行计划</h2>
                {entry.plan_metrics ? (
                  <div className="bg-muted/35 rounded-lg border p-4 text-sm">
                    <p className="text-muted-foreground text-xs leading-relaxed">测算基准（与列表「预期盈利率」同源）</p>
                    <dl className="mt-3 grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1">
                        <dt className="text-muted-foreground text-xs font-medium">参考价</dt>
                        <dd className="text-foreground tabular-nums text-base font-medium">{formatPricePlain(entry.plan_metrics.reference_price)}</dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-muted-foreground text-xs font-medium">目标价</dt>
                        <dd className="text-foreground tabular-nums text-base font-medium">{formatPricePlain(entry.plan_metrics.target_price)}</dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-muted-foreground text-xs font-medium">预期盈利率</dt>
                        <dd
                          className={cn(
                            "tabular-nums text-base font-semibold",
                            entry.plan_metrics.expected_return_pct > 0 && "text-emerald-600 dark:text-emerald-400",
                            entry.plan_metrics.expected_return_pct < 0 && "text-red-600 dark:text-red-400",
                          )}
                        >
                          {entry.plan_metrics.expected_return_pct > 0 ? "+" : ""}
                          {entry.plan_metrics.expected_return_pct.toFixed(1)}%
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
                <dl className="text-muted-foreground grid gap-x-4 gap-y-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-foreground text-xs">关注区间</dt>
                    <dd>{entry.plan.focus_range}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground text-xs">风险位</dt>
                    <dd>{entry.plan.risk_level_price}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground text-xs">目标位</dt>
                    <dd>{entry.plan.target_price}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground text-xs">风险敞口</dt>
                    <dd>{entry.plan.risk_exposure_pct}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground text-xs">失效条件</dt>
                    <dd>{entry.plan.invalidation}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground text-xs">有效期</dt>
                    <dd>{entry.plan.valid_until}</dd>
                  </div>
                </dl>
              </section>
              <Separator />
              <section className="grid gap-6 lg:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <h2 className="text-foreground text-sm font-semibold tracking-tight">正向证据</h2>
                  {entry.evidence_positive.length === 0 ? (
                    <p className="text-muted-foreground text-sm">未记录正向证据。</p>
                  ) : (
                    <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4 text-sm">
                      {entry.evidence_positive.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <h2 className="text-foreground text-sm font-semibold tracking-tight">负向证据</h2>
                  {entry.evidence_negative.length === 0 ? (
                    <p className="text-muted-foreground text-sm">未记录负向证据。</p>
                  ) : (
                    <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4 text-sm">
                      {entry.evidence_negative.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <h2 className="text-foreground text-sm font-semibold tracking-tight">冲突与分歧</h2>
                  {(entry.evidence_conflicts?.length ?? 0) === 0 ? (
                    <p className="text-muted-foreground text-sm">当前无显著冲突信号。</p>
                  ) : (
                    <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4 text-sm">
                      {entry.evidence_conflicts?.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
              <Separator />
              <section className="flex flex-col gap-2">
                <h2 className="text-foreground text-sm font-semibold tracking-tight">复盘检查清单</h2>
                {entry.reminders.length === 0 ? (
                  <p className="text-muted-foreground text-sm">当前记录未包含复盘提醒。</p>
                ) : (
                  <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4 text-sm">
                    {entry.reminders.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            </CardContent>
          </Card>
        </div>
      )}
    </AppPageLayout>
  );
}
