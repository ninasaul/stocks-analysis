"use client";

import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { selectUnreadMessageCount, useMessagesStore } from "@/stores/use-messages-store";

export function AppMessageNotificationsTrigger() {
  const router = useRouter();
  const messagesHydrated = useStoreHydrated(useMessagesStore);
  const unread = useMessagesStore(selectUnreadMessageCount);

  const label =
    messagesHydrated && unread > 0
      ? `消息，${unread} 条未读`
      : "消息";

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="relative"
      aria-label={label}
      onClick={() => router.push("/app/messages")}
    >
      <BellIcon className="size-4" aria-hidden />
      {messagesHydrated && unread > 0 ? (
        <span className="bg-destructive text-destructive-foreground pointer-events-none absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Button>
  );
}
