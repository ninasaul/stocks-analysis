"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { accountCopy } from "@/lib/copy";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSubscriptionStore } from "@/stores/use-subscription-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { requestCurrentMembership, type MembershipApiResult } from "@/lib/api/subscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { PageLoadingState } from "@/components/features/page-state";

export default function AccountPage() {
  const router = useRouter();
  const authHydrated = useStoreHydrated(useAuthStore);
  const subHydrated = useStoreHydrated(useSubscriptionStore);
  const session = useAuthStore((s) => s.session);
  const syncSession = useAuthStore((s) => s.syncSession);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const getPlan = useSubscriptionStore((s) => s.getPlan);
  const currentPlanId = useSubscriptionStore((s) => s.currentPlanId);
  const billingCycle = useSubscriptionStore((s) => s.billingCycle);
  const periodEnd = useSubscriptionStore((s) => s.periodEnd);
  const autoRenew = useSubscriptionStore((s) => s.autoRenew);
  const [logoutPending, setLogoutPending] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipApiResult | null>(null);

  const subscriptionReady = subHydrated;
  const backendSubscription = useMemo(() => {
    if (!membership) return null;
    if (membership.type === "normal") {
      return {
        planId: "free" as const,
        billingCycle: null,
        periodEnd: null,
        autoRenew: false,
      };
    }
    if (membership.type === "premium_quarterly") {
      return {
        planId: "pro" as const,
        billingCycle: "quarter" as const,
        periodEnd: membership.end_date?.slice(0, 10) ?? null,
        autoRenew: membership.status === "active",
      };
    }
    if (membership.type === "premium_yearly") {
      return {
        planId: "pro" as const,
        billingCycle: "year" as const,
        periodEnd: membership.end_date?.slice(0, 10) ?? null,
        autoRenew: membership.status === "active",
      };
    }
    return {
      planId: "pro" as const,
      billingCycle: "month" as const,
      periodEnd: membership.end_date?.slice(0, 10) ?? null,
      autoRenew: membership.status === "active",
    };
  }, [membership]);

  const displayPlanId = backendSubscription?.planId ?? currentPlanId;
  const displayBillingCycle = backendSubscription?.billingCycle ?? billingCycle;
  const displayPeriodEnd = backendSubscription?.periodEnd ?? periodEnd;
  const displayAutoRenew = backendSubscription?.autoRenew ?? autoRenew;

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
        const result = await requestCurrentMembership(latest.accessToken);
        if (!cancelled) {
          setMembership(result);
        }
      } catch (error) {
        if (!cancelled) {
          setMembershipError(error instanceof Error ? error.message : "获取会员信息失败");
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

  if (!authHydrated || !subscriptionReady) {
    return (
      <PageLoadingState title="正在加载账号信息" description="请稍候，正在同步你的账号状态。" />
    );
  }

  return (
    <>
        <Card>
          <CardHeader>
            <CardTitle>订阅与套餐</CardTitle>
            <CardDescription>当前档位与计费周期；变更套餐请前往订阅页。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">当前</span>
              <Badge variant={displayPlanId === "pro" ? "default" : "secondary"}>
                {getPlan(displayPlanId).name}
              </Badge>
              {displayPlanId === "pro" && displayBillingCycle ? (
                <span className="text-muted-foreground">
                  · {displayBillingCycle === "month" ? "月付" : displayBillingCycle === "quarter" ? "季付" : "年付"}
                </span>
              ) : null}
            </div>
            {displayPeriodEnd ? (
              <p className="text-muted-foreground">
                当前周期至 <span className="text-foreground font-medium tabular-nums">{displayPeriodEnd}</span>
                ，自动续费：{displayAutoRenew ? "开" : "关"}
              </p>
            ) : (
              <p className="text-muted-foreground">未开通付费套餐。</p>
            )}
            {membershipLoading ? (
              <p className="text-muted-foreground inline-flex items-center gap-2">
                <Spinner />
                正在同步后端会员状态
              </p>
            ) : null}
            {membershipError ? (
              <p className="text-sm text-destructive">{membershipError}</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button variant="outline" render={<Link href="/subscription" />}>
              查看订阅与用量
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>登录方式</CardTitle>
            <CardDescription>账号标识与绑定状态</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              账号标识：
              <span className="font-medium">{user?.phoneMasked || "暂未获取账号标识"}</span>
            </p>
            <p className="text-muted-foreground">
              微信绑定：{user?.wechatBound ? accountCopy.wechatBound : accountCopy.wechatNotBound}
            </p>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={logoutPending}
              onClick={async () => {
                if (logoutPending) return;
                setLogoutPending(true);
                try {
                  await logout();
                  router.push("/");
                } finally {
                  setLogoutPending(false);
                }
              }}
            >
              {logoutPending ? (
                <>
                  <Spinner />
                  退出中
                </>
              ) : (
                "退出登录"
              )}
            </Button>
          </CardFooter>
        </Card>

    </>
  );
}
