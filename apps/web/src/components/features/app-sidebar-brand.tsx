"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type AppSidebarBrandProps = {
  collapsedTextClassName?: string;
};

export function AppSidebarBrand({ collapsedTextClassName }: AppSidebarBrandProps) {
  return (
    <>
      <span className="flex items-center justify-center">
        <Image src="/logo_light.svg" alt="智谱投研 Logo" width={20} height={20} className="block dark:hidden" />
        <Image src="/logo_dark.svg" alt="智谱投研 Logo" width={20} height={20} className="hidden dark:block" />
      </span>
      <span className={cn("min-w-0 flex-1", collapsedTextClassName)}>
        <span className="block truncate font-semibold tracking-tight">智谱投研</span>
        <span className="text-muted-foreground block truncate text-xs">股票研究与决策助手</span>
      </span>
    </>
  );
}
