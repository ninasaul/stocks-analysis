"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { accountCopy } from "@/lib/copy";
import { useAuthStore } from "@/stores/use-auth-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageLoadingState } from "@/components/features/page-state";

export default function AccountPage() {
  const router = useRouter();
  const hydrated = useStoreHydrated(useAuthStore);
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [logoutPending, setLogoutPending] = useState(false);

  if (!hydrated) {
    return (
      <AppPageLayout title="我的账号" description="管理登录状态、账号信息与账户权限。">
        <PageLoadingState title="正在加载账号信息" description="请稍候，正在同步你的账号状态。" />
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout title="我的账号" description="管理登录状态、账号信息与账户权限。" contentClassName="gap-6">
      {session === "guest" ? (
        <Card>
          <CardHeader>
            <CardTitle>当前为游客模式</CardTitle>
            <CardDescription>登录后可同步历史存档、订阅权益与使用配额。</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button render={<Link href="/login" />}>去登录</Button>
          </CardFooter>
        </Card>
      ) : (
        <>
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
                  logout();
                  router.push("/");
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
      )}

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
