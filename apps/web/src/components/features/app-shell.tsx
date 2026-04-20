"use client";

import Link from "next/link";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ZhputianAppSidebar } from "@/components/features/zhputian-app-sidebar";
import { ComplianceBanner } from "@/components/features/compliance-banner";
import { AppBreadcrumb } from "@/components/features/app-breadcrumb";
import { ThemeSwitcher } from "@/components/features/theme-switcher";
import { subscriptionTierPublicCopy } from "@/lib/copy";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSubscriptionStore } from "@/stores/use-subscription-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const planName = useSubscriptionStore((s) => s.getPlan(s.currentPlanId).name);

  return (
    <SidebarProvider defaultOpen={false}>
      <ZhputianAppSidebar />
      <SidebarInset className="flex min-h-svh flex-col">
        <header
          data-app-print-hide
          className="bg-background/95 sticky top-0 z-40 flex shrink-0 flex-col gap-2 border-b px-3 py-2 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-4 md:py-2.5"
        >
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <div className="min-w-0 flex-1">
              <AppBreadcrumb />
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <ThemeSwitcher />
              <Badge variant="outline" className="hidden text-xs sm:inline-flex">
                {session === "guest" ? "游客" : planName}
              </Badge>
              {session === "guest" ? (
                <Button size="sm" variant="outline" render={<Link href="/login" />}>
                  登录
                </Button>
              ) : (
                <Button size="sm" variant="ghost" render={<Link href="/app/account" />}>
                  我的账号
                </Button>
              )}
              <Button size="sm" variant="secondary" render={<Link href="/subscription" />}>
                {subscriptionTierPublicCopy.ctaViewPlansShort}
              </Button>
            </div>
          </div>
          <ComplianceBanner />
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

