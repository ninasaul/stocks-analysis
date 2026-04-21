"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SETTINGS_SECTION_HEADING_ID = "settings-active-section-heading";

const sections = [
  {
    href: "/app/settings",
    label: "基础设置",
    hint: "外观与合规入口",
    isActive: (pathname: string) =>
      pathname === "/app/settings" || pathname === "/app/settings/",
  },
  {
    href: "/app/settings/analysis",
    label: "分析设置",
    hint: "股票预测默认值",
    isActive: (pathname: string) => pathname.startsWith("/app/settings/analysis"),
  },
  {
    href: "/app/settings/notifications",
    label: "通知设置",
    hint: "页面内提示开关",
    isActive: (pathname: string) => pathname.startsWith("/app/settings/notifications"),
  },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeSectionLabel = sections.find((s) => s.isActive(pathname))?.label ?? "基础设置";

  return (
    <AppPageLayout
      hideHeader
      title="设置"
      className="gap-4 md:gap-5"
      contentClassName="min-h-0 flex-1 gap-0"
    >
      <h1 className="sr-only">设置</h1>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-4">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start" aria-label="设置分区">
          <nav aria-label="设置分区导航">
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
                    render={
                      <Link
                        href={item.href}
                        prefetch
                        aria-current={active ? "page" : undefined}
                      />
                    }
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
          aria-labelledby={SETTINGS_SECTION_HEADING_ID}
        >
          <h2
            id={SETTINGS_SECTION_HEADING_ID}
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
