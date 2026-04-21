"use client";

import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PageLoadingStateProps = {
  title?: string;
  description?: string;
  className?: string;
};

export function PageLoadingState({
  title = "正在加载页面内容",
  description = "请稍候，当前数据正在同步。",
  className,
}: PageLoadingStateProps) {
  return (
    <div className={cn("rounded-xl border p-4", className)} aria-live="polite" aria-busy="true">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="text-muted-foreground text-sm">
          <p>{title}</p>
          <p>{description}</p>
        </div>
      </div>
    </div>
  );
}

type PageEmptyStateProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export function PageEmptyState({ title, description, actions, className }: PageEmptyStateProps) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {actions}
    </Empty>
  );
}

type PageErrorStateProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export function PageErrorState({ title, description, actions, className }: PageErrorStateProps) {
  return (
    <Alert variant="destructive" className={className} role="alert">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{description}</span>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </AlertDescription>
    </Alert>
  );
}
