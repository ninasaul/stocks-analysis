"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { accountCopy } from "@/lib/copy";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSubscriptionStore } from "@/stores/use-subscription-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageLoadingState } from "@/components/features/page-state";

export default function AccountPage() {
  const router = useRouter();
  const authHydrated = useStoreHydrated(useAuthStore);
  const subHydrated = useStoreHydrated(useSubscriptionStore);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const getPlan = useSubscriptionStore((s) => s.getPlan);
  const currentPlanId = useSubscriptionStore((s) => s.currentPlanId);
  const billingCycle = useSubscriptionStore((s) => s.billingCycle);
  const periodEnd = useSubscriptionStore((s) => s.periodEnd);
  const autoRenew = useSubscriptionStore((s) => s.autoRenew);
  const [logoutPending, setLogoutPending] = useState(false);

  const subscriptionReady = subHydrated;

  if (!authHydrated || !subscriptionReady) {
    return (
      <AppPageLayout title="我的账号" description="管理登录状态、账号信息与账户权限。">
        <PageLoadingState title="正在加载账号信息" description="请稍候，正在同步你的账号状态。" />
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout title="我的账号" description="管理登录状态、账号信息与账户权限。" contentClassName="gap-6">
      <>
        <Card>
          <CardHeader>
            <CardTitle>订阅与套餐</CardTitle>
            <CardDescription>当前档位与计费周期；变更套餐请前往订阅页。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">当前</span>
              <Badge variant={currentPlanId === "pro" ? "default" : "secondary"}>
                {getPlan(currentPlanId).name}
              </Badge>
              {currentPlanId === "pro" ? (
                <span className="text-muted-foreground">
                  · {billingCycle === "month" ? "月付" : "年付"}
                </span>
              ) : null}
            </div>
            {periodEnd ? (
              <p className="text-muted-foreground">
                当前周期至 <span className="text-foreground font-medium tabular-nums">{periodEnd}</span>
                ，自动续费：{autoRenew ? "开" : "关"}
              </p>
            ) : (
              <p className="text-muted-foreground">未开通付费套餐。</p>
            )}
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

        <Alert>
          <AlertTitle>账号注销</AlertTitle>
          <AlertDescription>{accountCopy.deactivateNote}</AlertDescription>
        </Alert>
      </>

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" render={<Link href="/privacy" />}>
          隐私政策
        </Button>
        <Button variant="outline" render={<Link href="/terms" />}>
          服务条款
        </Button>
      </div>
    </AppPageLayout>
  );
}
