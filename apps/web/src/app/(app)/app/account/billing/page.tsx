"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSubscriptionStore, type SubscriptionOrder } from "@/stores/use-subscription-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { requestBillingOrders, requestCurrentMembership, type BillingOrderApiResult } from "@/lib/api/subscription";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
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
  const router = useRouter();
  const authHydrated = useStoreHydrated(useAuthStore);
  const subHydrated = useStoreHydrated(useSubscriptionStore);
  const session = useAuthStore((s) => s.session);
  const syncSession = useAuthStore((s) => s.syncSession);
  const orders = useSubscriptionStore((s) => s.orders);
  const currentPlanId = useSubscriptionStore((s) => s.currentPlanId);
  const periodEnd = useSubscriptionStore((s) => s.periodEnd);
  const billingCycle = useSubscriptionStore((s) => s.billingCycle);
  const getPlan = useSubscriptionStore((s) => s.getPlan);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [remoteMembership, setRemoteMembership] = useState<{
    limit: number;
    used: number;
    remaining: number;
  } | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [remoteOrders, setRemoteOrders] = useState<SubscriptionOrder[]>([]);

  const displayOrders = useMemo(() => (remoteOrders.length > 0 ? remoteOrders : orders), [remoteOrders, orders]);

  useEffect(() => {
    let cancelled = false;
    if (!authHydrated || session !== "user") {
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      setMembershipLoading(true);
      setMembershipError(null);
      try {
        await syncSession();
        const latest = useAuthStore.getState();
        if (latest.session !== "user" || !latest.accessToken) {
          throw new Error("登录状态已失效，请重新登录");
        }
        const membership = await requestCurrentMembership(latest.accessToken);
        if (!cancelled) {
          setRemoteMembership({
            limit: membership.api_call_limit,
            used: membership.api_call_used,
            remaining: membership.api_call_remaining,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setMembershipError(error instanceof Error ? error.message : "获取用量失败");
        }
      } finally {
        if (!cancelled) {
          setMembershipLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authHydrated, session, syncSession]);

  useEffect(() => {
    let cancelled = false;
    if (!authHydrated || session !== "user") {
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      setOrderLoading(true);
      setOrderError(null);
      try {
        await syncSession();
        const latest = useAuthStore.getState();
        if (latest.session !== "user" || !latest.accessToken) {
          throw new Error("登录状态已失效，请重新登录");
        }
        const backendOrders = await requestBillingOrders(latest.accessToken);
        if (!cancelled) {
          setRemoteOrders(
            backendOrders.map((item: BillingOrderApiResult) => {
              const amountSource = item.amount_label ?? (typeof item.amount === "number" ? String(item.amount) : item.amount ?? "");
              const amount = String(amountSource || "").trim();
              const currency = (item.currency || "CNY").toUpperCase();
              return {
                id: String(item.id),
                placedAt: item.created_at ?? item.placed_at ?? new Date().toISOString(),
                planName: item.plan_name ?? "专业版",
                amountLabel: amount.startsWith("¥") || amount.startsWith("$") ? amount : currency === "CNY" ? `¥${amount}` : `${currency} ${amount}`,
                status: item.status,
              };
            }),
          );
        }
      } catch (error) {
        if (!cancelled) {
          setOrderError(error instanceof Error ? error.message : "获取订单失败");
        }
      } finally {
        if (!cancelled) {
          setOrderLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authHydrated, session, syncSession]);

  if (!subHydrated || !authHydrated) {
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
          <Button type="button" variant="outline" onClick={() => router.push("/app/account/subscription")}>
            订阅与用量
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>用量总览</CardTitle>
          <CardDescription>同步后端会员用量计数，优先展示服务端统计结果。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {membershipLoading ? (
            <p className="text-muted-foreground inline-flex items-center gap-2">
              <Spinner />
              正在同步用量...
            </p>
          ) : null}
          {membershipError ? <p className="text-sm text-destructive">{membershipError}</p> : null}
          {remoteMembership ? (
            <>
              <p>
                本周期额度：<span className="font-medium tabular-nums">{remoteMembership.limit}</span>
              </p>
              <p>
                已使用：<span className="font-medium tabular-nums">{remoteMembership.used}</span>，剩余{" "}
                <span className="font-medium tabular-nums">{remoteMembership.remaining}</span>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">登录后可查看实时接口调用用量。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>订单记录</CardTitle>
          <CardDescription>优先展示后端账单订单；接口不可用时回退本地记录。</CardDescription>
        </CardHeader>
        <CardContent>
          {orderLoading ? (
            <p className="text-muted-foreground inline-flex items-center gap-2 text-sm">
              <Spinner />
              正在同步后端订单...
            </p>
          ) : null}
          {orderError ? <p className="text-sm text-destructive">{orderError}</p> : null}
          {displayOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无订单记录。开通或续费专业版后，将在此展示最近订单。</p>
          ) : (
            <ul className="divide-border flex flex-col divide-y rounded-md border">
              {displayOrders.map((o) => (
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
