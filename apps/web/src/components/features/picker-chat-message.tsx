"use client";

import { CheckIcon, CopyIcon, PencilLineIcon, PlusIcon, Trash2Icon, TrendingUpIcon } from "lucide-react";
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { pickerCopy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { PickerMessage } from "@/stores/use-picker-store";

const assistantMarkdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 text-sm leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 flex list-disc flex-col gap-1 pl-4 text-sm">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 flex list-decimal flex-col gap-1 pl-4 text-sm">{children}</ol>
  ),
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
  hr: () => <Separator className="my-3" />,
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
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-border/60">
      <table className="w-full min-w-max border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-border/50">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th className="px-2 py-1.5 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
};

async function copyMessageBody(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(pickerCopy.copyMessageSuccess);
  } catch {
    toast.error(pickerCopy.copyMessageError);
  }
}

type InlineStock = {
  name: string;
  code: string;
  displayCode?: string;
};

function extractInlineStocks(content: string): InlineStock[] {
  const result: InlineStock[] = [];
  const byCode = new Map<string, InlineStock>();
  const addStock = (name: string, rawCode: string) => {
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!normalizedCode) return;
    const code = normalizedCode.split(".")[0]?.trim().toUpperCase() ?? "";
    if (!name || !code) return;
    const existing = byCode.get(code);
    const next: InlineStock = { name, code, displayCode: normalizedCode };
    if (!existing) {
      byCode.set(code, next);
      return;
    }
    if (!(existing.displayCode ?? "").includes(".") && normalizedCode.includes(".")) {
      byCode.set(code, next);
    }
  };

  const codeFirstBracketPattern =
    /\b(\d{6}(?:\.[A-Za-z]{2})?)\b\s*[（(]\s*([A-Za-z0-9\u4E00-\u9FFF·\- ]{1,40})\s*[)）]/g;
  for (const match of content.matchAll(codeFirstBracketPattern)) {
    addStock(match[2]?.trim() ?? "", match[1]?.trim() ?? "");
  }

  const codeFirstSpacePattern =
    /\b(\d{6}(?:\.[A-Za-z]{2})?)\b[\s,，:：]+([A-Za-z0-9\u4E00-\u9FFF·\- ]{1,40})/g;
  for (const match of content.matchAll(codeFirstSpacePattern)) {
    addStock(match[2]?.trim() ?? "", match[1]?.trim() ?? "");
  }

  const nameFirstBracketPattern =
    /([A-Za-z0-9\u4E00-\u9FFF·\- ]{1,40})\s*[（(]\s*(\d{6}(?:\.[A-Za-z]{2})?)\s*[)）]/g;
  for (const match of content.matchAll(nameFirstBracketPattern)) {
    addStock(match[1]?.trim() ?? "", match[2]?.trim() ?? "");
  }

  return Array.from(byCode.values());
}

export function PickerChatEmpty({ mode }: { mode: "consult" | "pick" | null }) {
  const modeLine =
    mode === "consult"
      ? pickerCopy.chatEmptyModeConsult
      : mode === "pick"
        ? pickerCopy.chatEmptyModePick
        : pickerCopy.chatEmptyModeUnset;

  return (
    <div className="text-muted-foreground flex flex-col gap-4 rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 py-7">
      <p className="text-foreground text-sm leading-relaxed">{pickerCopy.chatIntro}</p>
      <div className="border-border flex flex-col gap-2 border-t pt-4">
        <p className="text-foreground text-sm font-medium">{pickerCopy.chatEmptyTitle}</p>
        <p className="text-sm leading-relaxed">{pickerCopy.chatEmptyBody}</p>
        <p className="text-sm leading-relaxed">{modeLine}</p>
      </div>
    </div>
  );
}

export function PickerChatMessage({
  message,
  anchorId,
  onEditMessage,
  onDeleteMessage,
  onAnalyzeStock,
  onAddWatchlistStock,
  isInWatchlist,
  showPostStreamUi = true,
}: {
  message: PickerMessage;
  anchorId?: string;
  onEditMessage?: (message: PickerMessage) => void;
  onDeleteMessage?: (message: PickerMessage) => void;
  onAnalyzeStock?: (code: string) => void;
  onAddWatchlistStock?: (stock: InlineStock) => void;
  isInWatchlist?: (code: string) => boolean;
  showPostStreamUi?: boolean;
}) {
  const isUser = message.role === "user";
  const canCopy = message.content.trim().length > 0;
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const inlineStocks = useMemo(() => extractInlineStocks(message.content), [message.content]);

  const handleFeedback = (next: "up" | "down") => {
    setFeedback((prev) => {
      const resolved = prev === next ? null : next;
      if (resolved === "up") toast.success("已记录：有帮助");
      if (resolved === "down") toast.success("已记录：还需改进");
      if (resolved === null) toast.success("已取消反馈");
      return resolved;
    });
  };

  return (
    <article
      id={anchorId}
      className={cn("group/message flex min-w-0 flex-col", isUser ? "items-end gap-1" : "items-start gap-1.5")}
      aria-label={isUser ? "用户消息" : "助手消息"}
    >
      <div
        className={cn(
          "min-w-0 max-w-full wrap-break-word",
          isUser
            ? "rounded-md border border-border bg-muted/40 px-3 py-2 text-foreground"
            : "rounded-none border-0 bg-transparent p-0 text-foreground",
        )}
      >
        <div className={cn("flex min-w-0 flex-col", isUser ? "gap-1" : "gap-2")}>
          <div className="min-w-0 text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={assistantMarkdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
          {showPostStreamUi && inlineStocks.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {inlineStocks.map((stock) => {
                const alreadyInWatchlist = isInWatchlist?.(stock.code) ?? false;
                return (
                  <HoverCard key={`${message.id}-${stock.code}`}>
                    <HoverCardTrigger className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      {(stock.displayCode ?? stock.code).toUpperCase()}（{stock.name}）
                    </HoverCardTrigger>
                    <HoverCardContent side="top" align="start" className="w-72">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5">
                          <TrendingUpIcon className="text-muted-foreground size-4" />
                          <p className="text-sm font-medium leading-tight">
                            {(stock.displayCode ?? stock.code).toUpperCase()}（{stock.name}）
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => onAnalyzeStock?.(stock.code)}
                            disabled={!onAnalyzeStock}
                          >
                            分析
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant={alreadyInWatchlist ? "secondary" : "outline"}
                            onClick={() => onAddWatchlistStock?.(stock)}
                            disabled={alreadyInWatchlist || !onAddWatchlistStock}
                          >
                            {alreadyInWatchlist ? <CheckIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
                            {alreadyInWatchlist ? "已在自选" : "加自选"}
                          </Button>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {showPostStreamUi ? (
        <div
          className={cn(
            "pointer-events-none -mt-1 flex gap-1 px-1 opacity-0 transition-opacity group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100",
            isUser ? "self-end" : "self-start",
          )}
        >
          {isUser && onEditMessage ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onEditMessage(message)}
                    aria-label="编辑用户消息"
                  >
                    <PencilLineIcon />
                  </Button>
                }
              />
              <TooltipContent side="top" align="start">
                编辑消息
              </TooltipContent>
            </Tooltip>
          ) : null}
          {!isUser ? (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-xs"
                      variant={feedback === "up" ? "secondary" : "ghost"}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => handleFeedback("up")}
                      aria-label="赞同回答"
                    >
                      <ThumbsUpIcon />
                    </Button>
                  }
                />
                <TooltipContent side="top" align="start">
                  赞同回答
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-xs"
                      variant={feedback === "down" ? "secondary" : "ghost"}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => handleFeedback("down")}
                      aria-label="不赞同回答"
                    >
                      <ThumbsDownIcon />
                    </Button>
                  }
                />
                <TooltipContent side="top" align="start">
                  不赞同回答
                </TooltipContent>
              </Tooltip>
            </>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => void copyMessageBody(message.content)}
                  disabled={!canCopy}
                  aria-label={isUser ? "复制用户消息" : "复制助手消息"}
                >
                  <CopyIcon />
                </Button>
              }
            />
            <TooltipContent side="top" align="start">
              复制消息
            </TooltipContent>
          </Tooltip>
          {onDeleteMessage ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteMessage(message)}
                    aria-label={isUser ? "删除用户消息" : "删除助手消息"}
                  >
                    <Trash2Icon />
                  </Button>
                }
              />
              <TooltipContent side="top" align="start">
                删除消息
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
