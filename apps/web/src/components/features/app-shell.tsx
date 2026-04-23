"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ZhputianAppSidebar } from "@/components/features/zhputian-app-sidebar";
import { ComplianceBanner } from "@/components/features/compliance-banner";
import { AppBreadcrumb } from "@/components/features/app-breadcrumb";
import { ThemeSwitcher } from "@/components/features/theme-switcher";
import { subscriptionTierPublicCopy } from "@/lib/copy";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSubscriptionStore } from "@/stores/use-subscription-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const authHydrated = useStoreHydrated(useAuthStore);
  const syncSession = useAuthStore((s) => s.syncSession);
  const session = useAuthStore((s) => s.session);
  const planName = useSubscriptionStore((s) => s.getPlan(s.currentPlanId).name);
  const sessionSyncDoneRef = useRef(false);
  const [authGateReady, setAuthGateReady] = useState(false);

  useEffect(() => {
    if (!authHydrated || sessionSyncDoneRef.current) return;
    sessionSyncDoneRef.current = true;
    void (async () => {
      await syncSession();
      setAuthGateReady(true);
    })();
  }, [authHydrated, syncSession]);

  useEffect(() => {
    if (!authHydrated || !authGateReady) return;
    if (session !== "guest") return;
    const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [authGateReady, authHydrated, pathname, router, session]);

  if (!authHydrated || !authGateReady || session === "guest") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-muted-foreground inline-flex items-center gap-2 text-sm">
          <Spinner />
          正在验证登录状态...
        </p>
      </div>
    );
  }

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
                {planName}
              </Badge>
              <Button size="sm" variant="ghost" render={<Link href="/app/account" />}>
                我的账号
              </Button>
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

