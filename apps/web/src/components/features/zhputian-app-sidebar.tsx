"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  ChartLineIcon,
  CircleUserIcon,
  HistoryIcon,
  MessageCircleIcon,
  SettingsIcon,
  StarIcon,
  WalletIcon,
} from "lucide-react";
import { AppSidebarBrand } from "@/components/features/app-sidebar-brand";
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
  const router = useRouter();
  const pathname = usePathname();
  const settingsActive = pathname === "/app/settings" || pathname.startsWith("/app/settings/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="group-data-[collapsible=icon]:justify-center"
              tooltip="返回工作台首页"
              aria-label="返回工作台首页"
              onClick={() => router.push("/app/analyze")}
            >
              <AppSidebarBrand collapsedTextClassName="group-data-[collapsible=icon]:hidden" />
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
                      tooltip={item.label}
                      onClick={() => router.push(item.href)}
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
              tooltip="设置"
              onClick={() => router.push("/app/settings")}
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
