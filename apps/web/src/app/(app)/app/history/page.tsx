"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageLoadingState } from "@/components/features/page-state";

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

type SortMode = "latest" | "confidence_desc" | "confidence_asc";

const sortModeLabels: Record<SortMode, string> = {
  latest: "按时间倒序",
  confidence_desc: "按置信度从高到低",
  confidence_asc: "按置信度从低到高",
};

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function HistoryPage() {
  const authHydrated = useStoreHydrated(useAuthStore);
  const archiveHydrated = useStoreHydrated(useArchiveStore);
  const archives = useArchiveStore((s) => s.archives);
  const [keyword, setKeyword] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const hydrated = authHydrated && archiveHydrated;

  const stats = useMemo(() => {
    if (archives.length === 0) return null;
    const total = archives.length;
    const avgConfidence = archives.reduce((sum, archive) => sum + archive.confidence, 0) / total;
    const downgradedCount = archives.filter((archive) => archive.gate_downgraded).length;
    const highRiskCount = archives.filter((archive) => archive.risk_level === "high").length;
    const weeklyCount = archives.filter((archive) => archive.timeframe === "weekly").length;
    const actionCounts = archives.reduce<Record<string, number>>((result, archive) => {
      const key = archive.action;
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {});

    return {
      total,
      avgConfidence,
      downgradedRate: downgradedCount / total,
      highRiskRate: highRiskCount / total,
      weeklyShare: weeklyCount / total,
      actionChartData: Object.entries(actionCounts)
        .map(([action, count]) => ({
          name: actionLabels[action] ?? action,
          value: (count / total) * 100,
        }))
        .sort((a, b) => b.value - a.value),
      latestTimestamp: archives[0]?.created_at ?? null,
    };
  }, [archives]);

  const filteredArchives = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const result = archives.filter((archive) => {
      const matchesKeyword =
        normalizedKeyword.length === 0 ||
        `${archive.market}.${archive.symbol}`.toLowerCase().includes(normalizedKeyword) ||
        archive.title.toLowerCase().includes(normalizedKeyword);
      const matchesAction = actionFilter === "all" || archive.action === actionFilter;
      const matchesRisk = riskFilter === "all" || archive.risk_level === riskFilter;
      return matchesKeyword && matchesAction && matchesRisk;
    });

    result.sort((left, right) => {
      if (sortMode === "confidence_desc") return right.confidence - left.confidence;
      if (sortMode === "confidence_asc") return left.confidence - right.confidence;
      return right.created_at - left.created_at;
    });
    return result;
  }, [archives, keyword, actionFilter, riskFilter, sortMode]);

  const hasActiveFilters =
    keyword.trim().length > 0 || actionFilter !== "all" || riskFilter !== "all" || sortMode !== "latest";

  return (
    <AppPageLayout title="历史与复盘" description={historyCopy.pageSubtitle} contentClassName="gap-6">
      {!hydrated ? (
        <PageLoadingState title="正在加载历史记录" description="请稍候，正在同步你的存档与复盘数据。" />
      ) : (
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">历史列表</TabsTrigger>
            <TabsTrigger value="stats">复盘看板</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-4">
              {stats ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <Card>
                    <CardHeader>
                      <CardDescription>总记录数</CardDescription>
                      <CardTitle className="text-2xl">{stats.total}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>平均置信度</CardDescription>
                      <CardTitle className="text-2xl">{stats.avgConfidence.toFixed(1)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>最近更新</CardDescription>
                      <CardTitle className="text-base">{stats.latestTimestamp ? formatDate(stats.latestTimestamp) : "--"}</CardTitle>
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
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>筛选与排序</CardTitle>
                      <CardDescription>按标的、动作和风险等级快速定位历史条目。</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="grid gap-3 lg:grid-cols-4">
                        <Input
                          value={keyword}
                          onChange={(event) => setKeyword(event.target.value)}
                          placeholder="搜索标的或标题"
                          aria-label="搜索标的或标题"
                        />
                        <Select value={actionFilter} onValueChange={(value) => setActionFilter(value ?? "all")}>
                          <SelectTrigger className="w-full">
                            <SelectValue>{actionLabels[actionFilter] ?? "全部动作"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="all">全部动作</SelectItem>
                              <SelectItem value="wait">观望</SelectItem>
                              <SelectItem value="trial">试仓</SelectItem>
                              <SelectItem value="add">加仓</SelectItem>
                              <SelectItem value="reduce">减仓</SelectItem>
                              <SelectItem value="exit">离场</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <Select value={riskFilter} onValueChange={(value) => setRiskFilter(value ?? "all")}>
                          <SelectTrigger className="w-full">
                            <SelectValue>{riskLabels[riskFilter] ?? "全部风险"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="all">全部风险</SelectItem>
                              <SelectItem value="low">低风险</SelectItem>
                              <SelectItem value="medium">中风险</SelectItem>
                              <SelectItem value="high">高风险</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <Select value={sortMode} onValueChange={(value) => setSortMode((value as SortMode | null) ?? "latest")}>
                          <SelectTrigger className="w-full">
                            <SelectValue>{sortModeLabels[sortMode]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="latest">按时间倒序</SelectItem>
                              <SelectItem value="confidence_desc">按置信度从高到低</SelectItem>
                              <SelectItem value="confidence_asc">按置信度从低到高</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <p className="text-muted-foreground">当前显示 {filteredArchives.length} 条记录</p>
                        {hasActiveFilters ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setKeyword("");
                              setActionFilter("all");
                              setRiskFilter("all");
                              setSortMode("latest");
                            }}
                          >
                            清空筛选
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>建议存档</CardTitle>
                      <CardDescription>条目默认按时间倒序，可在上方切换排序策略。</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {filteredArchives.length === 0 ? (
                        <Empty className="border-0">
                          <EmptyHeader>
                            <EmptyTitle>未匹配到记录</EmptyTitle>
                            <EmptyDescription>当前筛选条件下没有结果，请调整筛选项后重试。</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>标的</TableHead>
                              <TableHead className="hidden xl:table-cell">时间</TableHead>
                              <TableHead>动作</TableHead>
                              <TableHead className="hidden lg:table-cell">周期</TableHead>
                              <TableHead className="hidden lg:table-cell">风险</TableHead>
                              <TableHead>置信度</TableHead>
                              <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredArchives.map((archive) => (
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
                                <TableCell>{archive.confidence}</TableCell>
                                <TableCell className="text-right">
                                  <Button size="sm" variant="ghost" render={<Link href={`/app/history/${archive.id}`} />}>
                                    详情
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </>
            )}
          </TabsContent>
          <TabsContent value="stats" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{historyCopy.recapTitle}</CardTitle>
                <CardDescription>{historyCopy.recapDesc}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {!stats ? (
                  <Empty className="min-h-[120px] border-0">
                    <EmptyHeader>
                      <EmptyTitle>{historyCopy.recapInsufficientTitle}</EmptyTitle>
                      <EmptyDescription>{historyCopy.recapInsufficientDesc}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card className="border-dashed">
                        <CardHeader>
                          <CardDescription>{historyCopy.avgConfidence}</CardDescription>
                          <CardTitle>{stats.avgConfidence.toFixed(1)}</CardTitle>
                        </CardHeader>
                      </Card>
                      <Card className="border-dashed">
                        <CardHeader>
                          <CardDescription>总样本</CardDescription>
                          <CardTitle>{stats.total}</CardTitle>
                        </CardHeader>
                      </Card>
                    </div>
                    <ChartContainer config={reviewChartConfig} className="h-[240px] w-full max-w-xl">
                      <BarChart
                        data={stats.actionChartData}
                        accessibilityLayer
                      >
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                        <YAxis tickLine={false} axisLine={false} width={32} domain={[0, 100]} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                      </BarChart>
                    </ChartContainer>
                    <div className="flex flex-col gap-2 text-sm">
                      <span>{historyCopy.actionDistribution}</span>
                      <span className="text-muted-foreground">用于观察当前动作偏好是否过于集中。</span>
                    </div>
                    <div className="flex flex-col gap-2 text-sm">
                      <span>{historyCopy.downgradedRate}</span>
                      <Progress value={stats.downgradedRate * 100} />
                      <span className="text-muted-foreground">{(stats.downgradedRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex flex-col gap-2 text-sm">
                      <span>{historyCopy.highRiskRate}</span>
                      <Progress value={stats.highRiskRate * 100} />
                      <span className="text-muted-foreground">{(stats.highRiskRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex flex-col gap-2 text-sm">
                      <span>{historyCopy.weeklyShare}</span>
                      <Progress value={stats.weeklyShare * 100} />
                      <span className="text-muted-foreground">{(stats.weeklyShare * 100).toFixed(1)}%</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </AppPageLayout>
  );
}
