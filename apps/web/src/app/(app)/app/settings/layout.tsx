"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon, BotIcon, ChartLineIcon, Settings2Icon } from "lucide-react";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SETTINGS_SECTION_HEADING_ID = "settings-active-section-heading";

const sections = [
  {
    href: "/app/settings",
    label: "基础设置",
    icon: Settings2Icon,
    isActive: (pathname: string) =>
      pathname === "/app/settings" || pathname === "/app/settings/",
  },
  {
    href: "/app/settings/analysis",
    label: "分析设置",
    icon: ChartLineIcon,
    isActive: (pathname: string) => pathname.startsWith("/app/settings/analysis"),
  },
  {
    href: "/app/settings/notifications",
    label: "通知设置",
    icon: BellIcon,
    isActive: (pathname: string) => pathname.startsWith("/app/settings/notifications"),
  },
  {
    href: "/app/settings/llm",
    label: "大模型配置",
    icon: BotIcon,
    isActive: (pathname: string) => pathname.startsWith("/app/settings/llm"),
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
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-5 lg:grid-cols-[9rem_minmax(0,1fr)] lg:items-start">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start" aria-label="设置分区">
          <nav aria-label="设置分区导航">
            <div
              className={cn(
                "flex flex-row gap-1 overflow-x-auto overscroll-x-contain pb-0.5 lg:flex-col lg:overflow-visible lg:pb-0",
                "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              )}
            >
              {sections.map((item) => {
                const active = item.isActive(pathname);
                const Icon = item.icon;
                return (
                  <Button
                    key={item.href}
                    type="button"
                    variant={active ? "secondary" : "ghost"}
                    className="w-auto justify-start lg:w-full"
                    render={
                      <Link
                        href={item.href}
                        prefetch
                        aria-current={active ? "page" : undefined}
                      />
                    }
                  >
                    <Icon data-icon="inline-start" aria-hidden />
                    {item.label}
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
