"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const appearanceModeOptions = [
  { value: "light", label: "浅色", icon: SunIcon },
  { value: "dark", label: "深色", icon: MoonIcon },
  { value: "system", label: "跟随系统", icon: SunMoonIcon },
] as const;

function appearanceStatusText(
  theme: "light" | "dark" | "system",
  resolved: "light" | "dark" | undefined,
): string | null {
  if (!resolved) return null;
  if (theme === "system") {
    return `当前随系统显示为${resolved === "dark" ? "深色" : "浅色"}模式。`;
  }
  if (theme === "dark") {
    return "当前为深色模式。";
  }
  return "当前为浅色模式。";
}

function appearanceModeLabel(theme: "light" | "dark" | "system"): string {
  if (theme === "dark") return "深色";
  if (theme === "light") return "浅色";
  return "跟随系统";
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
  const selectedAppearanceMode =
    appearanceModeOptions.find((item) => item.value === theme) ?? appearanceModeOptions[2];
  const SelectedAppearanceIcon = selectedAppearanceMode.icon;

  return (
    <>
      <Card role="region" aria-labelledby="settings-subsection-appearance">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle id="settings-subsection-appearance">外观</CardTitle>
            <CardDescription>设置界面配色，偏好会保存在当前浏览器。</CardDescription>
          </div>
          <Badge variant="secondary" aria-live="polite">
            {appearanceModeLabel(theme)}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem] md:items-start">
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel id="settings-theme-label">颜色模式</FieldLabel>
              {statusLine ? (
                <FieldDescription aria-live="polite">{statusLine}</FieldDescription>
              ) : null}
              <Select
                value={theme}
                onValueChange={(value) => {
                  if (value === "light" || value === "dark" || value === "system") {
                    setTheme(value);
                  }
                }}
              >
                <SelectTrigger
                  id="settings-theme"
                  aria-labelledby="settings-theme-label"
                  className="w-full sm:w-48"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <SelectedAppearanceIcon aria-hidden />
                    <span className="truncate">{selectedAppearanceMode.label}</span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {appearanceModeOptions.map((item) => {
                      const Icon = item.icon;
                      return (
                        <SelectItem key={item.value} value={item.value}>
                          <Icon aria-hidden />
                          {item.label}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <div
            className="rounded-lg border bg-muted/40 p-3"
            aria-label="当前外观预览"
          >
            <div className="rounded-md border bg-background p-3 shadow-xs">
              <div className="mb-3 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground/30" />
                <span className="size-2 rounded-full bg-muted-foreground/30" />
                <span className="size-2 rounded-full bg-muted-foreground/30" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="h-2 w-20 rounded-full bg-foreground/80" />
                <div className="h-2 w-full rounded-full bg-muted-foreground/25" />
                <div className="h-2 w-4/5 rounded-full bg-muted-foreground/20" />
                <div className="mt-1 h-6 w-24 rounded-md bg-primary/90" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card role="region" aria-labelledby="settings-subsection-analysis-notify">
        <CardHeader>
          <CardTitle id="settings-subsection-analysis-notify">偏好设置</CardTitle>
          <CardDescription>管理分析参数、通知和大模型配置。</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/app/settings/analysis" prefetch />}>
            分析设置
          </Button>
          <Button variant="outline" render={<Link href="/app/settings/notifications" prefetch />}>
            通知设置
          </Button>
          <Button variant="outline" render={<Link href="/app/settings/llm" prefetch />}>
            大模型配置
          </Button>
        </CardFooter>
      </Card>

      <Card role="region" aria-labelledby="settings-subsection-account">
        <CardHeader>
          <CardTitle id="settings-subsection-account">账号与订阅</CardTitle>
          <CardDescription>查看登录状态、当前套餐和用量。</CardDescription>
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
    </>
  );
}
