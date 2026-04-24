"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ChartLineIcon,
  CircleUserIcon,
  HistoryIcon,
  MessageCircleIcon,
  SettingsIcon,
  StarIcon,
  WalletIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const nav = [
  { href: "/app/analyze", label: "股票预测", icon: ChartLineIcon },
  { href: "/app/pick", label: "选股对话", icon: MessageCircleIcon },
  { href: "/app/watchlist", label: "自选", icon: StarIcon },
  { href: "/app/paper-trading", label: "模拟交易", icon: WalletIcon },
  { href: "/app/history", label: "历史与复盘", icon: HistoryIcon },
  { href: "/app/account", label: "账号", icon: CircleUserIcon },
] as const;

export function ZhputianAppSidebar() {
  const pathname = usePathname();
  const settingsActive = pathname === "/app/settings" || pathname.startsWith("/app/settings/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/app/analyze" prefetch />}
              tooltip="返回工作台首页"
              aria-label="返回工作台首页"
            >
              <span className="flex items-center justify-center">
                <Image
                  src="/logo_light.svg"
                  alt="智谱投研 Logo"
                  width={20}
                  height={20}
                  className="block dark:hidden"
                />
                <Image
                  src="/logo_dark.svg"
                  alt="智谱投研 Logo"
                  width={20}
                  height={20}
                  className="hidden dark:block"
                />
              </span>
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <span className="block truncate font-semibold tracking-tight">
                  智谱投研
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  股票研究与决策助手
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作台</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      render={<Link href={item.href} prefetch />}
                      tooltip={item.label}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={settingsActive}
              render={<Link href="/app/settings" prefetch />}
              tooltip="设置"
            >
              <SettingsIcon />
              <span>设置</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
