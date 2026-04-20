"use client";

import { CopyIcon } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { pickerCopy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { PickerMessage } from "@/stores/use-picker-store";

const assistantMarkdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 text-sm leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-4 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-4 text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <div className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</div>
  ),
  h2: ({ children }) => (
    <div className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</div>
  ),
  h3: ({ children }) => (
    <div className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</div>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-muted-foreground/30 text-muted-foreground my-2 border-l-2 pl-3 text-sm italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-3" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2"
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return <code className={cn("font-mono text-xs", className)}>{children}</code>;
    }
    return (
      <code className="bg-muted/90 rounded px-1 py-0.5 font-mono text-[0.8em]">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="border-border bg-muted/40 my-2 overflow-x-auto rounded-lg border p-3 text-xs">
      {children}
    </pre>
  ),
};

function formatMessageTime(ms: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatMessageTimeIso(ms: number) {
  return new Date(ms).toISOString();
}

async function copyMessageBody(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(pickerCopy.copyMessageSuccess);
  } catch {
    toast.error(pickerCopy.copyMessageError);
  }
}

export function PickerChatEmpty({ mode }: { mode: "consult" | "pick" | null }) {
  const modeLine =
    mode === "consult"
      ? pickerCopy.chatEmptyModeConsult
      : mode === "pick"
        ? pickerCopy.chatEmptyModePick
        : pickerCopy.chatEmptyModeUnset;

  return (
    <div className="text-muted-foreground flex flex-col gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-8">
      <p className="text-foreground text-sm leading-relaxed">{pickerCopy.chatIntro}</p>
      <div className="border-border border-t pt-3">
        <p className="text-foreground text-sm font-medium">{pickerCopy.chatEmptyTitle}</p>
        <p className="mt-2 text-sm leading-relaxed">{pickerCopy.chatEmptyBody}</p>
        <p className="mt-2 text-sm leading-relaxed">{modeLine}</p>
      </div>
    </div>
  );
}

export function PickerChatMessage({
  message,
  anchorId,
}: {
  message: PickerMessage;
  anchorId?: string;
}) {
  const isUser = message.role === "user";
  const labelId = `pick-msg-${message.id}-label`;
  const timeLabel = formatMessageTime(message.createdAt);
  const timeIso = formatMessageTimeIso(message.createdAt);

  return (
    <article
      id={anchorId}
      className={cn("flex min-w-0 flex-col gap-1", isUser ? "items-end" : "items-start")}
      aria-label={isUser ? "用户消息" : "助手消息"}
    >
      <div
        className={cn(
          "flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs",
          isUser ? "flex-row-reverse justify-end" : "flex-row",
        )}
      >
        <span
          id={labelId}
          className={cn(isUser ? "font-medium text-foreground" : "text-muted-foreground")}
        >
          {isUser ? "我" : "助手"}
        </span>
        <time dateTime={timeIso} className="text-muted-foreground tabular-nums">
          {timeLabel}
        </time>
        {!isUser ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 px-1.5"
            onClick={() => void copyMessageBody(message.content)}
            disabled={!message.content.trim()}
          >
            <CopyIcon data-icon="inline-start" />
            复制
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          "min-w-0 max-w-[min(100%,36rem)] rounded-2xl px-3 py-2 wrap-break-word",
          isUser ? "bg-primary/12 text-foreground" : "bg-muted/45 text-foreground",
        )}
        aria-labelledby={labelId}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="min-w-0 text-sm">
            <ReactMarkdown components={assistantMarkdownComponents}>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </article>
  );
}
