"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  history: "历史与复盘",
  account: "账号",
};

export function AppBreadcrumb() {
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
            <BreadcrumbItem className="max-w-[12rem] truncate sm:max-w-none">
              {c.current ? (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={c.href} />}>{c.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
