"use client";

import Link from "next/link";
import { useSubscriptionStore, type SubscriptionOrder } from "@/stores/use-subscription-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoadingState } from "@/components/features/page-state";

function orderStatusLabel(status: SubscriptionOrder["status"]): string {
  switch (status) {
    case "paid":
      return "已支付";
    case "pending":
      return "处理中";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

function orderStatusVariant(
  status: SubscriptionOrder["status"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid":
      return "default";
    case "pending":
      return "secondary";
    case "failed":
      return "destructive";
    case "cancelled":
      return "outline";
    default:
      return "outline";
  }
}

function formatPlacedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AccountBillingPage() {
  const subHydrated = useStoreHydrated(useSubscriptionStore);
  const orders = useSubscriptionStore((s) => s.orders);
  const currentPlanId = useSubscriptionStore((s) => s.currentPlanId);
  const periodEnd = useSubscriptionStore((s) => s.periodEnd);
  const billingCycle = useSubscriptionStore((s) => s.billingCycle);
  const getPlan = useSubscriptionStore((s) => s.getPlan);

  if (!subHydrated) {
    return (
      <PageLoadingState title="正在加载账单" description="请稍候，正在同步订单记录。" />
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>当前订阅</CardTitle>
          <CardDescription>与账单相关的套餐与周期信息；变更套餐请在订阅页操作。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            套餐：<span className="font-medium">{getPlan(currentPlanId).name}</span>
            {currentPlanId === "pro" ? (
              <span className="text-muted-foreground">
                {" "}
                ·{" "}
                {billingCycle === "month"
                  ? "月付"
                  : billingCycle === "quarter"
                    ? "季付"
                    : "年付"}
              </span>
            ) : null}
          </p>
          {periodEnd ? (
            <p className="text-muted-foreground">
              当前服务周期至{" "}
              <span className="text-foreground font-medium tabular-nums">{periodEnd}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">未开通付费套餐时，仅展示历史或演示订单。</p>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" render={<Link href="/subscription" prefetch />}>
            订阅与用量
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>订单记录</CardTitle>
          <CardDescription>
            以下为本地演示环境生成的订单快照；正式环境以支付渠道与后台对账为准。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无订单记录。开通或续费专业版后，将在此展示最近订单。</p>
          ) : (
            <ul className="divide-border flex flex-col divide-y rounded-md border">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{o.planName}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatPlacedAt(o.placedAt)} · 单号 {o.id}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">{o.amountLabel}</span>
                    <Badge variant={orderStatusVariant(o.status)}>{orderStatusLabel(o.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
