"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const labels: Record<string, string> = {
  analyze: "股票预测",
  pick: "选股对话",
  watchlist: "自选",
  "paper-trading": "模拟交易",
  history: "历史与复盘",
  account: "用户中心",
  settings: "设置",
  messages: "消息",
};

export function AppBreadcrumb() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "app") return null;

  type Crumb = { href: string; label: string; current?: boolean };
  const crumbs: Crumb[] = [];

  if (segments.length === 1) {
    crumbs.push({ href: "/app", label: "工作台", current: true });
  } else if (segments[1] === "history" && segments[2]) {
    crumbs.push({ href: "/app", label: "工作台" });
    crumbs.push({ href: "/app/history", label: "历史与复盘" });
    crumbs.push({ href: pathname, label: "存档详情", current: true });
  } else if (segments[1] === "settings" && segments[2] === "analysis") {
    crumbs.push({ href: "/app", label: "工作台" });
    crumbs.push({ href: "/app/settings", label: "设置" });
    crumbs.push({ href: pathname, label: "分析设置", current: true });
  } else if (segments[1] === "settings" && segments[2] === "notifications") {
    crumbs.push({ href: "/app", label: "工作台" });
    crumbs.push({ href: "/app/settings", label: "设置" });
    crumbs.push({ href: pathname, label: "通知设置", current: true });
  } else if (segments[1] === "account" && segments[2] === "billing") {
    crumbs.push({ href: "/app", label: "工作台" });
    crumbs.push({ href: "/app/account", label: "用户中心" });
    crumbs.push({ href: pathname, label: "账单", current: true });
  } else {
    crumbs.push({ href: "/app", label: "工作台" });
    const seg = segments[1] ?? "";
    crumbs.push({
      href: pathname,
      label: labels[seg] ?? seg,
      current: true,
    });
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((c, i) => (
          <span key={`${c.href}-${c.label}`} className="contents">
            {i > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="max-w-48 truncate sm:max-w-none">
              {c.current ? (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  render={<button type="button" onClick={() => router.push(c.href)} />}
                >
                  {c.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
