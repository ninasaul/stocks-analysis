"use client";

import Link from "next/link";
import { useState } from "react";
import { subscriptionCopy } from "@/lib/copy";
import { useAuthStore } from "@/stores/use-auth-store";
import type { SubscriptionOrder } from "@/stores/use-subscription-store";
import { useSubscriptionStore } from "@/stores/use-subscription-store";
import { requestCheckout } from "@/lib/api/subscription";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function statusLabel(s: SubscriptionOrder["status"]) {
  if (s === "paid") return "已支付";
  if (s === "pending") return "处理中";
  if (s === "failed") return "失败";
  return "已取消";
}

export default function SubscriptionPage() {
  const session = useAuthStore((s) => s.session);
  const isGuest = session === "guest";
  const plans = useSubscriptionStore((s) => s.plans);
  const currentPlanId = useSubscriptionStore((s) => s.currentPlanId);
  const periodEnd = useSubscriptionStore((s) => s.periodEnd);
  const autoRenew = useSubscriptionStore((s) => s.autoRenew);
  const paymentStatus = useSubscriptionStore((s) => s.paymentStatus);
  const orders = useSubscriptionStore((s) => s.orders);
  const setPaymentStatus = useSubscriptionStore((s) => s.setPaymentStatus);
  const simulateSubscribeSuccess = useSubscriptionStore((s) => s.simulateSubscribeSuccess);
  const appendOrder = useSubscriptionStore((s) => s.appendOrder);
  const resetToFree = useSubscriptionStore((s) => s.resetToFree);
  const analysisLeft = useSubscriptionStore((s) => s.getDailyAnalysisRemaining(isGuest));
  const pickerLeft = useSubscriptionStore((s) => s.getPickerSessionsRemaining(isGuest));

  const [agree, setAgree] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const startPay = () => {
    if (!agree) return;
    void requestCheckout({ plan_id: "pro", agreed_terms: true });
    setPaymentStatus("pending");
    window.setTimeout(() => {
      simulateSubscribeSuccess();
      setPaymentStatus("success");
      setShowResult(true);
    }, 1200);
  };

  const recordFailed = () => {
    appendOrder({
      id: `ord-${Date.now()}`,
      placedAt: new Date().toISOString(),
      planName: "专业档",
      amountLabel: "¥68",
      status: "failed",
    });
    setPaymentStatus("failed");
    setShowResult(true);
  };

  const recordCancelled = () => {
    appendOrder({
      id: `ord-${Date.now()}`,
      placedAt: new Date().toISOString(),
      planName: "专业档",
      amountLabel: "¥68",
      status: "cancelled",
    });
    setPaymentStatus("cancelled");
    setShowResult(true);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12 md:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">订阅与会员</h1>
        <p className="text-muted-foreground text-sm">{subscriptionCopy.pageSubtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>当前状态</CardTitle>
          <CardDescription>{subscriptionCopy.currentCardDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-4 text-muted-foreground">
            <span>
              今日股票预测剩余：
              <span className="text-foreground font-medium tabular-nums">{analysisLeft}</span>
            </span>
            <span>
              今日选股会话剩余：
              <span className="text-foreground font-medium tabular-nums">{pickerLeft}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">档位</span>
            <Badge variant={currentPlanId === "pro" ? "default" : "secondary"}>
              {currentPlanId === "pro" ? "专业档" : "免费档"}
            </Badge>
          </div>
          {periodEnd ? (
            <p className="text-muted-foreground">
              周期至 {periodEnd} · 自动续费：{autoRenew ? "开" : "关"}
            </p>
          ) : (
            <p className="text-muted-foreground">未开通付费档</p>
          )}
          <p className="text-muted-foreground text-xs">最近支付状态：{paymentStatus}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={resetToFree}>
            {subscriptionCopy.resetFree}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>套餐对比</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>项目</TableHead>
                {plans.map((p) => (
                  <TableHead key={p.id}>{p.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>价格</TableCell>
                {plans.map((p) => (
                  <TableCell key={p.id}>{p.priceLabel}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell>{subscriptionCopy.tableDailyAnalysis}</TableCell>
                {plans.map((p) => (
                  <TableCell key={p.id}>{p.dailyAnalysisLimit >= 999 ? "不限" : p.dailyAnalysisLimit}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell>{subscriptionCopy.tablePickerSessions}</TableCell>
                {plans.map((p) => (
                  <TableCell key={p.id}>{p.pickerSessionDaily}</TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
          <Separator className="my-6" />
          <div className="flex flex-col gap-4">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
              <span>
                已阅读并同意
                <Button variant="link" className="mx-1 h-auto p-0 text-sm" render={<Link href="/terms" />}>
                  服务条款
                </Button>
                与
                <Button variant="link" className="mx-1 h-auto p-0 text-sm" render={<Link href="/privacy" />}>
                  隐私政策
                </Button>
                ，知悉数字化订阅与退款政策以公示为准。
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!agree || currentPlanId === "pro"} onClick={startPay}>
                {subscriptionCopy.payCta}
              </Button>
              <Button type="button" variant="outline" onClick={recordFailed}>
                {subscriptionCopy.payFailSim}
              </Button>
              <Button type="button" variant="ghost" onClick={recordCancelled}>
                {subscriptionCopy.payCancelSim}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{subscriptionCopy.orderSectionTitle}</CardTitle>
          <CardDescription>{subscriptionCopy.orderSectionDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无订单记录。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>档位</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(o.placedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{o.planName}</TableCell>
                    <TableCell>{o.amountLabel}</TableCell>
                    <TableCell>{statusLabel(o.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>说明</AlertTitle>
        <AlertDescription>{subscriptionCopy.alertNote}</AlertDescription>
      </Alert>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {paymentStatus === "success"
                ? "支付成功"
                : paymentStatus === "failed"
                  ? "支付失败"
                  : paymentStatus === "cancelled"
                    ? "已取消"
                    : "处理中"}
            </DialogTitle>
            <DialogDescription>
              {paymentStatus === "success"
                ? subscriptionCopy.paySuccessDesc
                : subscriptionCopy.payRetryDesc}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowResult(false)}>
              关闭
            </Button>
            <Button type="button" render={<Link href="/app/analyze" />}>
              去股票预测
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
