"use client";

import Link from "next/link";
import { useMemo } from "react";
import { historyCopy } from "@/lib/copy";
import { useArchiveStore } from "@/stores/use-archive-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageLoadingState } from "@/components/features/page-state";
import type { ArchiveEntry } from "@/lib/contracts/domain";
import { cn } from "@/lib/utils";

const reviewChartConfig = {
  value: { label: "占比", color: "var(--chart-1)" },
} as const;

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

function expectedReturnClassName(pct: number) {
  if (pct > 0) return "text-emerald-600 dark:text-emerald-400";
  if (pct < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function formatExpectedReturnPct(archive: ArchiveEntry) {
  const pct = archive.plan_metrics?.expected_return_pct;
  if (pct === undefined || !Number.isFinite(pct)) return null;
  const body = `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  return { text: body, pct };
}

export default function HistoryPage() {
  const authHydrated = useStoreHydrated(useAuthStore);
  const archiveHydrated = useStoreHydrated(useArchiveStore);
  const archives = useArchiveStore((s) => s.archives);
  const hydrated = authHydrated && archiveHydrated;

  const stats = useMemo(() => {
    if (archives.length === 0) return null;
    const total = archives.length;
    const avgConfidence = archives.reduce((sum, archive) => sum + archive.confidence, 0) / total;
    const downgradedCount = archives.filter((archive) => archive.gate_downgraded).length;
    const highRiskCount = archives.filter((archive) => archive.risk_level === "high").length;
    const mediumRiskCount = archives.filter((archive) => archive.risk_level === "medium").length;
    const lowRiskCount = archives.filter((archive) => archive.risk_level === "low").length;
    const weeklyCount = archives.filter((archive) => archive.timeframe === "weekly").length;
    const actionCounts = archives.reduce<Record<string, number>>((result, archive) => {
      const key = archive.action;
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {});
    const returnSamples = archives
      .map((a) => a.plan_metrics?.expected_return_pct)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const avgExpectedReturnPct =
      returnSamples.length > 0 ? returnSamples.reduce((s, v) => s + v, 0) / returnSamples.length : null;
    const positiveReturnCount = returnSamples.filter((v) => v > 0).length;
    const positiveReturnShare = returnSamples.length > 0 ? positiveReturnCount / returnSamples.length : null;

    return {
      total,
      avgConfidence,
      downgradedRate: downgradedCount / total,
      gatePassRate: (total - downgradedCount) / total,
      highRiskRate: highRiskCount / total,
      mediumRiskRate: mediumRiskCount / total,
      lowRiskRate: lowRiskCount / total,
      weeklyShare: weeklyCount / total,
      returnSampleCount: returnSamples.length,
      avgExpectedReturnPct,
      positiveReturnShare,
      actionChartData: Object.entries(actionCounts)
        .map(([action, count]) => ({
          name: actionLabels[action] ?? action,
          value: (count / total) * 100,
        }))
        .sort((a, b) => b.value - a.value),
      latestTimestamp: archives[0]?.created_at ?? null,
    };
  }, [archives]);

  return (
    <AppPageLayout title="历史与复盘" description={historyCopy.pageSubtitle} contentClassName="gap-6">
      {!hydrated ? (
        <PageLoadingState title="正在加载历史记录" description="请稍候，正在同步你的存档与复盘数据。" />
      ) : (
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list" className="w-32">
              历史列表
            </TabsTrigger>
            <TabsTrigger value="stats" className="w-32">
              复盘看板
            </TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-4 flex flex-col gap-6">
              {stats ? (
                <div className="grid items-stretch gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                  <Card className="h-full shadow-none">
                    <CardHeader className="pb-3">
                      <CardDescription>总记录数</CardDescription>
                      <CardTitle className="text-2xl tabular-nums">{stats.total}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="h-full shadow-none">
                    <CardHeader className="pb-3">
                      <CardDescription>平均置信度</CardDescription>
                      <CardTitle className="text-2xl tabular-nums">{stats.avgConfidence.toFixed(1)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="h-full shadow-none">
                    <CardHeader className="pb-3">
                      <CardDescription>{historyCopy.avgExpectedReturn}</CardDescription>
                      <CardTitle
                        className={cn(
                          "text-2xl tabular-nums",
                          stats.avgExpectedReturnPct !== null && expectedReturnClassName(stats.avgExpectedReturnPct),
                        )}
                      >
                        {stats.avgExpectedReturnPct !== null
                          ? `${stats.avgExpectedReturnPct > 0 ? "+" : ""}${stats.avgExpectedReturnPct.toFixed(1)}%`
                          : "—"}
                      </CardTitle>
                      {stats.returnSampleCount > 0 ? (
                        <CardDescription className="text-xs leading-snug">
                          基于 {stats.returnSampleCount} 条含测算字段的存档
                        </CardDescription>
                      ) : (
                        <CardDescription className="text-xs leading-snug">旧存档无测算字段时显示为「—」</CardDescription>
                      )}
                    </CardHeader>
                  </Card>
                  <Card className="h-full shadow-none">
                    <CardHeader className="pb-3">
                      <CardDescription>最近更新</CardDescription>
                      <CardTitle className="text-sm font-semibold leading-snug sm:text-base">
                        {stats.latestTimestamp ? formatDate(stats.latestTimestamp) : "--"}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>
              ) : null}
            {archives.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>暂无记录</EmptyTitle>
                  <EmptyDescription>完成一次股票预测后，将在此出现条目。</EmptyDescription>
                </EmptyHeader>
                <Button render={<Link href="/app/analyze" />}>去分析</Button>
              </Empty>
            ) : (
                  <Card className="shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">建议存档</CardTitle>
                      <CardDescription>按生成时间倒序展示，与复盘统计使用同一批存档数据。</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <Table className="min-w-176">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-36">标的</TableHead>
                              <TableHead className="hidden min-w-40 xl:table-cell">时间</TableHead>
                              <TableHead className="whitespace-nowrap">动作</TableHead>
                              <TableHead className="hidden whitespace-nowrap lg:table-cell">周期</TableHead>
                              <TableHead className="hidden whitespace-nowrap lg:table-cell">风险</TableHead>
                              <TableHead className="w-16 text-right tabular-nums">置信度</TableHead>
                              <TableHead className="hidden w-26 text-right md:table-cell">预期盈利率</TableHead>
                              <TableHead className="w-18 text-right">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {archives.map((archive) => (
                              <TableRow key={archive.id}>
                                <TableCell className="font-medium">
                                  <div className="flex flex-col gap-1">
                                    <span>
                                      {archive.market}.{archive.symbol}
                                    </span>
                                    <span className="text-muted-foreground text-xs">{archive.title}</span>
                                    <span className="text-muted-foreground text-xs xl:hidden">
                                      {formatDate(archive.created_at)}
                                    </span>
                                    {(() => {
                                      const fr = formatExpectedReturnPct(archive);
                                      return fr ? (
                                        <span className={cn("text-xs tabular-nums md:hidden", expectedReturnClassName(fr.pct))}>
                                          预期 {fr.text}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground text-xs md:hidden">预期 —</span>
                                      );
                                    })()}
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground hidden text-sm xl:table-cell">
                                  {formatDate(archive.created_at)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{actionLabels[archive.action] ?? archive.action}</Badge>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <Badge variant="secondary">{timeframeLabels[archive.timeframe] ?? archive.timeframe}</Badge>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <Badge variant="secondary">{riskLabels[archive.risk_level] ?? archive.risk_level}</Badge>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{archive.confidence}</TableCell>
                                <TableCell className="hidden text-right text-sm tabular-nums md:table-cell">
                                  {(() => {
                                    const fr = formatExpectedReturnPct(archive);
                                    return fr ? (
                                      <span className={cn("font-medium", expectedReturnClassName(fr.pct))}>{fr.text}</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button size="sm" variant="ghost" render={<Link href={`/app/history/${archive.id}`} />}>
                                    详情
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                    </CardContent>
                  </Card>
            )}
          </TabsContent>
          <TabsContent value="stats" className="mt-4 flex flex-col gap-6">
            {!stats ? (
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle>{historyCopy.recapTitle}</CardTitle>
                  <CardDescription>{historyCopy.recapDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Empty className="min-h-[120px] border-0">
                    <EmptyHeader>
                      <EmptyTitle>{historyCopy.recapInsufficientTitle}</EmptyTitle>
                      <EmptyDescription>{historyCopy.recapInsufficientDesc}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{historyCopy.recapSnapshotTitle}</CardTitle>
                    <CardDescription>{historyCopy.recapSnapshotDesc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">{historyCopy.expectedReturnHelp}</p>
                    <div className="grid items-stretch gap-3 sm:grid-cols-3 sm:gap-4">
                      <Card className="border-dashed shadow-none">
                        <CardHeader className="pb-2">
                          <CardDescription>{historyCopy.avgConfidence}</CardDescription>
                          <CardTitle className="text-2xl tabular-nums">{stats.avgConfidence.toFixed(1)}</CardTitle>
                        </CardHeader>
                      </Card>
                      <Card className="border-dashed shadow-none">
                        <CardHeader className="pb-2">
                          <CardDescription>{historyCopy.avgExpectedReturn}</CardDescription>
                          <CardTitle
                            className={cn(
                              "text-2xl tabular-nums",
                              stats.avgExpectedReturnPct !== null && expectedReturnClassName(stats.avgExpectedReturnPct),
                            )}
                          >
                            {stats.avgExpectedReturnPct !== null
                              ? `${stats.avgExpectedReturnPct > 0 ? "+" : ""}${stats.avgExpectedReturnPct.toFixed(1)}%`
                              : "—"}
                          </CardTitle>
                          {stats.returnSampleCount > 0 ? (
                            <CardDescription className="text-xs">样本 {stats.returnSampleCount} 条</CardDescription>
                          ) : null}
                        </CardHeader>
                      </Card>
                      <Card className="border-dashed shadow-none">
                        <CardHeader className="pb-2">
                          <CardDescription>总样本</CardDescription>
                          <CardTitle className="text-2xl tabular-nums">{stats.total}</CardTitle>
                        </CardHeader>
                      </Card>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{historyCopy.recapDistributionTitle}</CardTitle>
                    <CardDescription>{historyCopy.recapDistributionDesc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-0">
                    <div className="flex flex-col gap-6 xl:grid xl:grid-cols-12 xl:items-start xl:gap-8">
                      <div className="space-y-4 xl:col-span-7">
                        <div>
                          <p className="text-foreground text-sm font-medium">{historyCopy.actionDistribution}</p>
                          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{historyCopy.actionDistributionHint}</p>
                        </div>
                        <ChartContainer config={reviewChartConfig} className="h-56 w-full sm:h-64">
                          <BarChart
                            data={stats.actionChartData}
                            accessibilityLayer
                            margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
                          >
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
                            <YAxis tickLine={false} axisLine={false} width={36} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                          </BarChart>
                        </ChartContainer>
                        <div className="rounded-xl border bg-muted/20 p-4">
                          <p className="text-foreground text-sm font-medium">{historyCopy.recapRiskMixTitle}</p>
                          <p className="text-muted-foreground mt-1 text-xs">{historyCopy.recapRiskMixHint}</p>
                          <div className="mt-4 space-y-4">
                            <div className="space-y-2 text-sm">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-muted-foreground">{historyCopy.riskTierLow}</span>
                                <span className="tabular-nums text-foreground">{(stats.lowRiskRate * 100).toFixed(1)}%</span>
                              </div>
                              <Progress value={stats.lowRiskRate * 100} />
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-muted-foreground">{historyCopy.riskTierMedium}</span>
                                <span className="tabular-nums text-foreground">{(stats.mediumRiskRate * 100).toFixed(1)}%</span>
                              </div>
                              <Progress value={stats.mediumRiskRate * 100} />
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-muted-foreground">{historyCopy.riskTierHigh}</span>
                                <span className="tabular-nums text-foreground">{(stats.highRiskRate * 100).toFixed(1)}%</span>
                              </div>
                              <Progress value={stats.highRiskRate * 100} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-muted/30 flex flex-col divide-y rounded-xl border xl:col-span-5">
                        <div className="space-y-2 p-4 text-sm">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{historyCopy.gatePassRate}</span>
                            <span className="text-muted-foreground tabular-nums">{(stats.gatePassRate * 100).toFixed(1)}%</span>
                          </div>
                          <Progress value={stats.gatePassRate * 100} />
                        </div>
                        {stats.positiveReturnShare !== null ? (
                          <div className="space-y-2 p-4 text-sm">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-medium">{historyCopy.positiveExpectedShare}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {(stats.positiveReturnShare * 100).toFixed(1)}%
                              </span>
                            </div>
                            <Progress value={stats.positiveReturnShare * 100} />
                          </div>
                        ) : null}
                        <div className="space-y-2 p-4 text-sm">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{historyCopy.downgradedRate}</span>
                            <span className="text-muted-foreground tabular-nums">{(stats.downgradedRate * 100).toFixed(1)}%</span>
                          </div>
                          <Progress value={stats.downgradedRate * 100} />
                        </div>
                        <div className="space-y-2 p-4 text-sm">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{historyCopy.weeklyShare}</span>
                            <span className="text-muted-foreground tabular-nums">{(stats.weeklyShare * 100).toFixed(1)}%</span>
                          </div>
                          <Progress value={stats.weeklyShare * 100} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </AppPageLayout>
  );
}
