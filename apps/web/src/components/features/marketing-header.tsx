"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { landingCopy, subscriptionTierPublicCopy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/features/theme-switcher";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAuthStore } from "@/stores/use-auth-store";

export function MarketingHeader() {
  const router = useRouter();
  const authHydrated = useStoreHydrated(useAuthStore);
  const session = useAuthStore((state) => state.session);
  const isUser = authHydrated && session === "user";
  const isGuest = authHydrated && session === "guest";

  return (
    <header className="border-border/40 bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 md:px-6">
        <button
          type="button"
          className="focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-lg px-1 py-1 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2"
          aria-label="返回首页"
          onClick={() => router.push("/")}
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
        </button>

        <nav className="flex flex-wrap items-center justify-end gap-0.5 sm:gap-1" aria-label="页面章节与操作">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:inline-flex"
            onClick={() => router.push("/#landing-features")}
          >
            产品特征
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:inline-flex"
            onClick={() => router.push("/#landing-how")}
          >
            {landingCopy.howItWorksHeading}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:inline-flex"
            onClick={() => router.push("/#landing-pricing")}
          >
            {subscriptionTierPublicCopy.ctaViewPlansShort}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground lg:inline-flex"
            onClick={() => router.push("/#landing-faq")}
          >
            常见问题
          </Button>
          <ThemeSwitcher />
          {!authHydrated ? (
            <div className="h-8 w-24 animate-pulse rounded-md border border-border/40 bg-muted/25" aria-hidden />
          ) : null}
          {isGuest ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/login")}>
                登录
              </Button>
              <Button type="button" size="sm" className="hidden sm:inline-flex" onClick={() => router.push("/register")}>
                注册
              </Button>
            </>
          ) : null}
          {isUser ? (
            <Button type="button" size="sm" onClick={() => router.push("/app/analyze")}>
              进入工作台
            </Button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
