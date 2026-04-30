"use client";

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
import { AppMessageNotificationsTrigger } from "@/components/features/app-message-notifications-trigger";
import { subscriptionTierPublicCopy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { requestCurrentMembership } from "@/lib/api/subscription";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSubscriptionStore } from "@/stores/use-subscription-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isPickPage = pathname === "/app/pick";
  const authHydrated = useStoreHydrated(useAuthStore);
  const syncSession = useAuthStore((s) => s.syncSession);
  const session = useAuthStore((s) => s.session);
  const accessToken = useAuthStore((s) => s.accessToken);
  const localPlanName = useSubscriptionStore((s) => s.getPlan(s.currentPlanId).name);
  const localPlanId = useSubscriptionStore((s) => s.currentPlanId);
  const localBillingCycle = useSubscriptionStore((s) => s.billingCycle);
  const sessionSyncDoneRef = useRef(false);
  const [authGateReady, setAuthGateReady] = useState(false);
  const [remotePlanLabel, setRemotePlanLabel] = useState<string | null>(null);
  const localPlanLabel =
    localPlanId === "pro"
      ? `${localPlanName}·${localBillingCycle === "month" ? "月付" : localBillingCycle === "quarter" ? "季付" : "年付"}`
      : localPlanName;
  const planName = remotePlanLabel ?? localPlanLabel;

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

  useEffect(() => {
    let cancelled = false;
    if (!authHydrated || !authGateReady || session !== "user" || !accessToken) {
      setRemotePlanLabel(null);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const membership = await requestCurrentMembership(accessToken);
        if (cancelled) return;
        const name =
          membership.type === "normal"
            ? "免费版"
            : membership.type === "premium_quarterly"
              ? "专业版·季付"
              : membership.type === "premium_yearly"
                ? "专业版·年付"
                : "专业版·月付";
        setRemotePlanLabel(name);
      } catch {
        if (!cancelled) {
          setRemotePlanLabel(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, authGateReady, authHydrated, session]);

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
      <SidebarInset className={cn("flex min-h-svh flex-col", isPickPage && "h-svh overflow-hidden")}>
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
              <AppMessageNotificationsTrigger />
              <ThemeSwitcher />
              <Badge variant="outline" className="hidden text-xs sm:inline-flex">
                {planName}
              </Badge>
              <Button type="button" size="sm" variant="secondary" onClick={() => router.push("/app/account/subscription")}>
                {subscriptionTierPublicCopy.ctaViewPlansShort}
              </Button>
            </div>
          </div>
          <ComplianceBanner />
        </header>
        <main className={cn("flex min-h-0 flex-1 flex-col", isPickPage && "overflow-hidden")}>{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

