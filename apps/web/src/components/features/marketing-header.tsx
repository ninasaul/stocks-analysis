"use client";

import Link from "next/link";
import Image from "next/image";
import { landingCopy, subscriptionTierPublicCopy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/features/theme-switcher";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAuthStore } from "@/stores/use-auth-store";

export function MarketingHeader() {
  const authHydrated = useStoreHydrated(useAuthStore);
  const session = useAuthStore((state) => state.session);
  const isUser = authHydrated && session === "user";
  const isGuest = authHydrated && session === "guest";

  return (
    <header className="border-border/40 bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link
          href="/"
          className="focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-lg px-1 py-1 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2"
          aria-label="返回首页"
        >
          <Image
            src="/logo_light.svg"
            alt="智谱投研 Logo"
            width={28}
            height={28}
            className="block dark:hidden"
            priority
          />
          <Image
            src="/logo_dark.svg"
            alt="智谱投研 Logo"
            width={28}
            height={28}
            className="hidden dark:block"
            priority
          />
          <span className="text-sm font-semibold tracking-tight md:text-base">智谱投研</span>
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-0.5 sm:gap-1" aria-label="页面章节与操作">
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:inline-flex"
            render={<Link href="/#landing-features" scroll />}
          >
            产品特征
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:inline-flex"
            render={<Link href="/#landing-how" scroll />}
          >
            {landingCopy.howItWorksHeading}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:inline-flex"
            render={<Link href="/#landing-pricing" scroll />}
          >
            {subscriptionTierPublicCopy.ctaViewPlansShort}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground lg:inline-flex"
            render={<Link href="/#landing-faq" scroll />}
          >
            常见问题
          </Button>
          <ThemeSwitcher />
          {!authHydrated ? (
            <div className="h-8 w-24 animate-pulse rounded-md border border-border/40 bg-muted/25" aria-hidden />
          ) : null}
          {isGuest ? (
            <>
              <Button variant="ghost" size="sm" render={<Link href="/login" />}>
                登录
              </Button>
              <Button size="sm" className="hidden sm:inline-flex" render={<Link href="/register" />}>
                注册
              </Button>
            </>
          ) : null}
          {isUser ? (
            <Button size="sm" render={<Link href="/app/analyze" />}>
              进入工作台
            </Button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
