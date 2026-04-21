"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AppPageLayoutProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  hideHeader?: boolean;
  fillHeight?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function AppPageLayout({
  title,
  description,
  actions,
  hideHeader = false,
  fillHeight = false,
  children,
  className,
  contentClassName,
}: AppPageLayoutProps) {
  return (
    <div className={cn("flex flex-col gap-6 p-4 md:p-6", fillHeight && "min-h-0 flex-1", className)}>
      {hideHeader ? null : (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className={cn("flex flex-col gap-4", fillHeight && "min-h-0 flex-1", contentClassName)}>{children}</div>
    </div>
  );
}
