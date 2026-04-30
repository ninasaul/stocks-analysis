"use client";

import { usePathname, useRouter } from "next/navigation";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCOUNT_SECTION_HEADING_ID = "account-active-section-heading";

const sections = [
  {
    href: "/app/account",
    label: "我的账号",
    hint: "登录与订阅概要",
    isActive: (pathname: string) =>
      pathname === "/app/account" || pathname === "/app/account/",
  },
  {
    href: "/app/account/subscription",
    label: "订阅与用量",
    hint: "套餐与配额",
    isActive: (pathname: string) => pathname.startsWith("/app/account/subscription"),
  },
  {
    href: "/app/account/billing",
    label: "账务与流水",
    hint: "账单与调用记录",
    isActive: (pathname: string) => pathname.startsWith("/app/account/billing"),
  },
] as const;

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeSectionLabel =
    sections.find((s) => s.isActive(pathname))?.label ?? "我的账号";

  return (
    <AppPageLayout
      hideHeader
      title="用户中心"
      className="gap-4 md:gap-5"
      contentClassName="min-h-0 flex-1 gap-0"
    >
      <h1 className="sr-only">用户中心</h1>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-4">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start" aria-label="用户中心分区">
          <nav aria-label="用户中心分区导航">
            <div
              className={cn(
                "flex flex-row gap-1 overflow-x-auto overscroll-x-contain pb-0.5 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0",
                "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              )}
            >
              {sections.map((item) => {
                const active = item.isActive(pathname);
                return (
                  <Button
                    key={item.href}
                    type="button"
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-auto min-h-8 shrink-0 flex-col gap-0.5 px-3 py-2 text-left font-normal whitespace-normal lg:w-full",
                      "items-start justify-start",
                    )}
                    aria-current={active ? "page" : undefined}
                    onClick={() => router.push(item.href)}
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="hidden text-xs text-muted-foreground lg:block">{item.hint}</span>
                  </Button>
                );
              })}
            </div>
          </nav>
        </aside>

        <section
          className="flex min-h-0 min-w-0 flex-col gap-6"
          aria-labelledby={ACCOUNT_SECTION_HEADING_ID}
        >
          <h2
            id={ACCOUNT_SECTION_HEADING_ID}
            className="text-foreground text-base font-semibold tracking-tight lg:sr-only"
          >
            {activeSectionLabel}
          </h2>
          {children}
        </section>
      </div>
    </AppPageLayout>
  );
}
