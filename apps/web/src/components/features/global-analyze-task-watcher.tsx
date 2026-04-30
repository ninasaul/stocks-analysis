"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { requestAnalyzeTaskStatus } from "@/lib/api/timing";
import { formatAnalyzeBoardSymbol } from "@/lib/analyze-symbol-search";
import { useAuthStore } from "@/stores/use-auth-store";

const PENDING_ANALYZE_TASK_KEY = "analyze-pending-task-v1";

type PendingTaskPayload = {
  taskId?: string;
  createdAt?: number;
  symbol?: string;
  market?: string;
  exchange?: string;
  stockName?: string;
};

function readPendingTasks(): PendingTaskPayload[] {
  try {
    const raw = window.localStorage.getItem(PENDING_ANALYZE_TASK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingTaskPayload | PendingTaskPayload[] | null;
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return list
      .map((item) => ({
        taskId: String(item?.taskId ?? "").trim() || undefined,
        createdAt: typeof item?.createdAt === "number" ? item.createdAt : undefined,
        symbol: String(item?.symbol ?? "").trim().toUpperCase() || undefined,
        market: String(item?.market ?? "").trim() || undefined,
        exchange: String(item?.exchange ?? "").trim() || undefined,
        stockName: String(item?.stockName ?? "").trim() || undefined,
      }))
      .filter((item) => Boolean(item.taskId));
  } catch {
    return [];
  }
}

function writePendingTasks(list: PendingTaskPayload[]) {
  if (!list.length) {
    window.localStorage.removeItem(PENDING_ANALYZE_TASK_KEY);
    return;
  }
  window.localStorage.setItem(PENDING_ANALYZE_TASK_KEY, JSON.stringify(list));
}

export function GlobalAnalyzeTaskWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const authSession = useAuthStore((s) => s.session);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneRecordId, setDoneRecordId] = useState<string | null>(null);
  const [doneStockLabel, setDoneStockLabel] = useState<string | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const isAnalyzeTaskPageForeground = useMemo(() => {
    return pathname.includes("/app/analyze");
  }, [pathname]);

  useEffect(() => {
    if (authSession !== "user") return;
    let canceled = false;

    const tick = async () => {
      // 分析页前台 task 轮询交给页面自身，避免重复请求。
      if (isAnalyzeTaskPageForeground) return;

      const tasks = readPendingTasks();
      if (!tasks.length) return;

      let changed = false;
      const remain: PendingTaskPayload[] = [];
      let firstDone: { recordId: string; stockLabel: string | null } | null = null;

      for (const payload of tasks) {
        const taskId = String(payload?.taskId ?? "").trim();
        if (!taskId) {
          changed = true;
          continue;
        }
        try {
          const task = await requestAnalyzeTaskStatus(taskId);
          if (canceled) return;
          const status = String(task.status ?? "").toUpperCase();
          const hasResult = task.result !== null && task.result !== undefined;
          const isCompleted = status === "COMPLETED" || status === "SUCCESS" || status === "DONE" || hasResult;
          const isFailed = status === "FAILED" || status === "ERROR" || status === "CANCELLED";
          const taskError = String(task.error ?? "").trim();

          if (taskError) {
            changed = true;
            setErrorMessage(taskError);
            setErrorOpen(true);
            continue;
          }

          if (isCompleted) {
            changed = true;
            const recordId = String(task.record_id ?? "").trim();
            if (!firstDone && recordId) {
              const symbol = String(payload?.symbol ?? "").trim().toUpperCase();
              const market = payload?.market;
              const codeLabel =
                symbol && (market === "CN" || market === "HK" || market === "US")
                  ? formatAnalyzeBoardSymbol(market, symbol)
                  : null;
              const stockName = String(payload?.stockName ?? "").trim();
              const stockLabel = stockName ? (codeLabel ? `${stockName}（${codeLabel}）` : stockName) : codeLabel;
              firstDone = { recordId, stockLabel };
            }
            continue;
          }

          if (isFailed) {
            changed = true;
            continue;
          }

          remain.push(payload);
        } catch {
          // 保持静默重试，避免瞬时网络错误打断用户。
          remain.push(payload);
        }
      }

      if (changed) writePendingTasks(remain);
      if (firstDone) {
        setDoneRecordId(firstDone.recordId);
        setDoneStockLabel(firstDone.stockLabel);
        setDoneOpen(true);
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 5000);

    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [authSession, isAnalyzeTaskPageForeground]);

  return (
    <>
      <AlertDialog open={doneOpen} onOpenChange={setDoneOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>分析任务已完成</AlertDialogTitle>
            <AlertDialogDescription>{doneStockLabel ? `标的 ${doneStockLabel} 的分析报告已生成。` : "你的分析报告已生成。"}可现在去查看，或稍后在分析页历史记录中打开。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDoneOpen(false);
                setDoneStockLabel(null);
              }}
            >
              我知道了
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDoneOpen(false);
                setDoneStockLabel(null);
                if (!doneRecordId) return;
                router.push(`/app/analyze?record_id=${encodeURIComponent(doneRecordId)}`);
              }}
            >
              去查看
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={errorOpen} onOpenChange={setErrorOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>分析任务异常</AlertDialogTitle>
            <AlertDialogDescription>{errorMessage || "任务执行失败，请稍后重试。"}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-end">
            <Button
              type="button"
              onClick={() => {
                setErrorOpen(false);
                setErrorMessage("");
              }}
            >
              我知道了
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

