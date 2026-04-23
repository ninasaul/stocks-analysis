"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSubscriptionStore } from "@/stores/use-subscription-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

function appearanceStatusText(
  theme: "light" | "dark" | "system",
  resolved: "light" | "dark" | undefined,
): string | null {
  if (!resolved) return null;
  if (theme === "system") {
    return `当前界面随系统为「${resolved === "dark" ? "深色" : "浅色"}」模式。`;
  }
  if (theme === "dark") {
    return "当前界面锁定为深色模式。";
  }
  return "当前界面锁定为浅色模式。";
}

export default function SettingsBasicPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const authHydrated = useStoreHydrated(useAuthStore);
  const subHydrated = useStoreHydrated(useSubscriptionStore);
  const user = useAuthStore((s) => s.user);
  const getPlan = useSubscriptionStore((s) => s.getPlan);
  const currentPlanId = useSubscriptionStore((s) => s.currentPlanId);

  const accountReady = authHydrated && subHydrated;

  const statusLine = useMemo(
    () => appearanceStatusText(theme, resolvedTheme),
    [theme, resolvedTheme],
  );

  return (
    <>
      <Card role="region" aria-labelledby="settings-subsection-appearance">
        <CardHeader>
          <CardTitle id="settings-subsection-appearance">外观</CardTitle>
          <CardDescription>
            选择界面配色。选择「跟随系统」后，界面会随操作系统的深浅色偏好自动切换。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel id="settings-theme-label">颜色模式</FieldLabel>
              <FieldDescription>选择后即时生效，并写入本机浏览器。</FieldDescription>
              <div
                className="flex flex-wrap gap-2 pt-1"
                role="group"
                aria-labelledby="settings-theme-label"
              >
                <Button
                  type="button"
                  variant={theme === "light" ? "default" : "outline"}
                  onClick={() => setTheme("light")}
                >
                  浅色
                </Button>
                <Button
                  type="button"
                  variant={theme === "dark" ? "default" : "outline"}
                  onClick={() => setTheme("dark")}
                >
                  深色
                </Button>
                <Button
                  type="button"
                  variant={theme === "system" ? "default" : "outline"}
                  onClick={() => setTheme("system")}
                >
                  跟随系统
                </Button>
              </div>
            </Field>
          </FieldGroup>
          {statusLine ? (
            <>
              <Separator />
              <p className="text-muted-foreground text-sm leading-relaxed" aria-live="polite">
                {statusLine}
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card role="region" aria-labelledby="settings-subsection-analysis-notify">
        <CardHeader>
          <CardTitle id="settings-subsection-analysis-notify">分析与通知</CardTitle>
          <CardDescription>
            分析设置保存股票预测默认参数；通知设置控制该页内成功类轻提示是否弹出（失败类仍会提示）。
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/app/settings/analysis" prefetch />}>
            分析设置
          </Button>
          <Button variant="outline" render={<Link href="/app/settings/notifications" prefetch />}>
            通知设置
          </Button>
        </CardFooter>
      </Card>

      <Card role="region" aria-labelledby="settings-subsection-account">
        <CardHeader>
          <CardTitle id="settings-subsection-account">账号与订阅</CardTitle>
          <CardDescription>
            查看登录方式、绑定状态与当前套餐；升级或续费在订阅页完成。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!accountReady ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner />
              正在同步账号与套餐状态
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed">
                账号标识：
                <span className="text-foreground font-medium">{user?.phoneMasked ?? "—"}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">已登录</Badge>
                <Badge variant={currentPlanId === "pro" ? "default" : "secondary"}>
                  {getPlan(currentPlanId).name}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/app/account" prefetch />}>
            我的账号
          </Button>
          <Button variant="outline" render={<Link href="/subscription" prefetch />}>
            订阅与用量
          </Button>
        </CardFooter>
      </Card>

      <Card role="region" aria-labelledby="settings-subsection-legal">
        <CardHeader>
          <CardTitle id="settings-subsection-legal">法律信息</CardTitle>
          <CardDescription>服务约定与数据处理说明的正式文本。</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/privacy" prefetch />}>
            隐私政策
          </Button>
          <Button variant="outline" render={<Link href="/terms" prefetch />}>
            服务条款
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
