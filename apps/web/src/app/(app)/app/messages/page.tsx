"use client";

import { useMemo } from "react";
import { AppPageLayout } from "@/components/features/app-page-layout";
import { PageEmptyState, PageLoadingState } from "@/components/features/page-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { cn } from "@/lib/utils";
import { selectUnreadMessageCount, useMessagesStore } from "@/stores/use-messages-store";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function MessagesPage() {
  const messagesHydrated = useStoreHydrated(useMessagesStore);
  const messages = useMessagesStore((s) => s.messages);
  const markRead = useMessagesStore((s) => s.markRead);
  const markAllRead = useMessagesStore((s) => s.markAllRead);
  const unread = useMessagesStore(selectUnreadMessageCount);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => b.createdAt - a.createdAt),
    [messages],
  );

  if (!messagesHydrated) {
    return (
      <AppPageLayout title="消息" description="系统通知与账号相关提醒集中在此。">
        <PageLoadingState />
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout
      title="消息"
      description="系统通知与账号相关提醒集中在此。"
      actions={
        unread > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => markAllRead()}>
            全部标为已读
          </Button>
        ) : null
      }
    >
      {sorted.length === 0 ? (
        <PageEmptyState
          title="暂无消息"
          description="新的通知会出现在此列表，你也可通过顶部铃铛快速进入。"
        />
      ) : (
        <ul className="rounded-xl border" role="list">
          {sorted.map((m, i) => (
            <li key={m.id}>
              {i > 0 ? <Separator /> : null}
              <button
                type="button"
                className={cn(
                  "hover:bg-muted/60 flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors",
                  !m.read && "bg-muted/30",
                )}
                onClick={() => {
                  if (!m.read) markRead(m.id);
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-medium">{m.title}</span>
                  {!m.read ? (
                    <Badge variant="secondary" className="shrink-0">
                      未读
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">{m.body}</p>
                <p className="text-muted-foreground text-xs">{formatTime(m.createdAt)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppPageLayout>
  );
}
