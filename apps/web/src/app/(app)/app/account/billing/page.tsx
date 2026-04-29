"use client";

import { useEffect, useMemo, useState } from "react";
import { useSubscriptionStore, type SubscriptionOrder } from "@/stores/use-subscription-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import {
  requestCurrentMembership,
  requestCurrentUserApiCalls,
  type ApiCallLogApiResult,
} from "@/lib/api/users";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const authHydrated = useStoreHydrated(useAuthStore);
  const subHydrated = useStoreHydrated(useSubscriptionStore);
  const session = useAuthStore((s) => s.session);
  const syncSession = useAuthStore((s) => s.syncSession);
  const orders = useSubscriptionStore((s) => s.orders);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [remoteMembership, setRemoteMembership] = useState<{
    limit: number;
    used: number;
    remaining: number;
  } | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [remoteApiCalls, setRemoteApiCalls] = useState<ApiCallLogApiResult[]>([]);

  const displayOrders = useMemo(() => orders, [orders]);

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
        const apiCallLogs = await requestCurrentUserApiCalls(latest.accessToken, {
          limit: 20,
          offset: 0,
        });
        if (!cancelled) {
          setRemoteApiCalls(apiCallLogs);
        }
      } catch (error) {
        if (!cancelled) {
          setOrderError(error instanceof Error ? error.message : "获取后端流水失败");
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
      <PageLoadingState title="正在加载账务数据" description="请稍候，正在同步额度与流水记录。" />
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>本月接口额度</CardTitle>
          <CardDescription>查看本月调用额度、已使用数量与剩余额度。</CardDescription>
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
                本月额度：<span className="font-medium tabular-nums">{remoteMembership.limit}</span>
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
          <CardTitle>账务与调用流水</CardTitle>
          <CardDescription>当前展示调用流水；支付账单功能上线后将在此统一展示。</CardDescription>
        </CardHeader>
        <CardContent>
          {orderLoading ? (
            <p className="text-muted-foreground inline-flex items-center gap-2 text-sm">
              <Spinner />
              正在同步后端流水...
            </p>
          ) : null}
          {orderError ? <p className="text-sm text-destructive">{orderError}</p> : null}
          {remoteApiCalls.length > 0 ? (
            <ul className="divide-border flex flex-col divide-y rounded-md border">
              {remoteApiCalls.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium truncate">{item.endpoint}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatPlacedAt(item.call_time)} · 日志 {item.id}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">{item.method}</span>
                    <Badge variant={item.response_status === 200 ? "default" : "secondary"}>
                      {item.response_status ?? "-"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : displayOrders.length > 0 ? (
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
          ) : (
            <p className="text-muted-foreground text-sm">暂无流水或订单记录。</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
