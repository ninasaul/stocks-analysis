"use client";

import Link from "next/link";
import { useState } from "react";
import { subscriptionCopy, subscriptionTierPublicCopy } from "@/lib/copy";
import { useAuthStore } from "@/stores/use-auth-store";
import type { BillingCycle, SubscriptionOrder } from "@/stores/use-subscription-store";
import { GUEST_QUOTA, useSubscriptionStore } from "@/stores/use-subscription-store";
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
import { cn } from "@/lib/utils";

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
  const getPlan = useSubscriptionStore((s) => s.getPlan);
  const currentPlanId = useSubscriptionStore((s) => s.currentPlanId);
  const billingCycle = useSubscriptionStore((s) => s.billingCycle);
  const currentPlan = getPlan(currentPlanId);
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
  const [checkoutCycle, setCheckoutCycle] = useState<BillingCycle>("month");

  const proPlan = getPlan("pro");

  const checkoutAmountLabel =
    checkoutCycle === "month"
      ? proPlan.settlementAmountLabel
      : checkoutCycle === "quarter"
        ? (proPlan.quarterlySettlementAmountLabel ?? "¥147")
        : (proPlan.annualSettlementAmountLabel ?? "¥468");
  const cycleSuffix =
    checkoutCycle === "month" ? "月" : checkoutCycle === "quarter" ? "季" : "年";

  const startPay = () => {
    if (!agree) return;
    void requestCheckout({ plan_id: "pro", billing_cycle: checkoutCycle, agreed_terms: true });
    setPaymentStatus("pending");
    window.setTimeout(() => {
      simulateSubscribeSuccess(checkoutCycle);
      setPaymentStatus("success");
      setShowResult(true);
    }, 1200);
  };

  const recordFailed = () => {
    appendOrder({
      id: `ord-${Date.now()}`,
      placedAt: new Date().toISOString(),
      planName: proPlan.name,
      amountLabel: checkoutAmountLabel,
      status: "failed",
    });
    setPaymentStatus("failed");
    setShowResult(true);
  };

  const recordCancelled = () => {
    appendOrder({
      id: `ord-${Date.now()}`,
      placedAt: new Date().toISOString(),
      planName: proPlan.name,
      amountLabel: checkoutAmountLabel,
      status: "cancelled",
    });
    setPaymentStatus("cancelled");
    setShowResult(true);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 md:px-6 md:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {subscriptionTierPublicCopy.subscriptionPageTitle}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {subscriptionCopy.pageSubtitle}
        </p>
      </div>

      {isGuest ? (
        <Alert>
          <AlertTitle>访客配额</AlertTitle>
          <AlertDescription className="text-muted-foreground leading-relaxed">
            未登录时每日股票预测 {GUEST_QUOTA.dailyStockAnalysis} 次、选股会话{" "}
            {GUEST_QUOTA.dailyPickerSessions} 次。登录后按
            <span className="text-foreground font-medium">{subscriptionTierPublicCopy.freeTierName}</span>
            配额执行；开通
            <span className="text-foreground font-medium">{subscriptionTierPublicCopy.proTierName}</span>
            后在当前设备本地生效（演示环境）。
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>当前状态</CardTitle>
          <CardDescription>{subscriptionCopy.currentCardDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
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
            <span className="text-muted-foreground">当前套餐</span>
            <Badge variant={currentPlanId === "pro" ? "default" : "secondary"}>{currentPlan.name}</Badge>
          </div>
          {currentPlanId === "pro" ? (
            <p className="text-muted-foreground">
              计费周期：
              <span className="text-foreground font-medium">
                {billingCycle === "month" ? "月付" : billingCycle === "quarter" ? "季付" : "年付"}
              </span>
            </p>
          ) : null}
          {periodEnd ? (
            <p className="text-muted-foreground">
              周期至 {periodEnd} · 自动续费：{autoRenew ? "开" : "关"}
            </p>
          ) : (
            <p className="text-muted-foreground">未开通付费套餐</p>
          )}
          <p className="text-muted-foreground text-xs">最近支付状态：{paymentStatus}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={resetToFree}>
            {subscriptionCopy.resetFree}
          </Button>
        </CardFooter>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {subscriptionTierPublicCopy.plansSectionTitle}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          以下为当前版本公示档位；自然日用量在每日 0 点（本地时区）按实现重置。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={cn(
              "relative flex h-full flex-col overflow-hidden",
              plan.id === "pro"
                ? "border-primary/40 shadow-md ring-1 ring-primary/15"
                : "border-border/80",
            )}
          >
            {plan.id === "pro" ? (
              <div className="absolute inset-e-4 top-4">
                <Badge>{subscriptionTierPublicCopy.proRecommendedBadge}</Badge>
              </div>
            ) : null}
            <CardHeader className="gap-2 pb-2">
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <CardDescription className="text-base leading-relaxed">{plan.tagline}</CardDescription>
              <p className="text-foreground pt-1 text-2xl font-semibold tabular-nums tracking-tight">
                {plan.priceLabel}
              </p>
              {plan.quarterlyPriceLabel ? (
                <div className="text-muted-foreground flex flex-col gap-0.5 pt-1 text-sm">
                  <p>
                    <span className="text-foreground font-medium tabular-nums">{plan.quarterlyPriceLabel}</span>
                    <span className="text-muted-foreground">（季付）</span>
                  </p>
                  {plan.quarterlyEquivMonthlyLabel ? (
                    <p className="text-xs leading-relaxed">{plan.quarterlyEquivMonthlyLabel}</p>
                  ) : null}
                </div>
              ) : null}
              {plan.annualPriceLabel ? (
                <div className="text-muted-foreground flex flex-col gap-0.5 pt-1 text-sm">
                  <p>
                    <span className="text-foreground font-medium tabular-nums">{plan.annualPriceLabel}</span>
                    <span className="text-muted-foreground">（年付）</span>
                  </p>
                  {plan.annualEquivMonthlyLabel ? (
                    <p className="text-xs leading-relaxed">{plan.annualEquivMonthlyLabel}</p>
                  ) : null}
                </div>
              ) : null}
              {plan.priceNote ? (
                <p className="text-muted-foreground text-xs leading-relaxed">{plan.priceNote}</p>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4 pt-0">
              <Separator />
              <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm leading-relaxed">
                {plan.features.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="text-muted-foreground border-border rounded-lg border bg-muted/20 px-3 py-2 text-xs leading-relaxed">
                <p>
                  每日股票预测{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {plan.dailyAnalysisLimit}
                  </span>{" "}
                  次 · 每日选股会话{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {plan.pickerSessionDaily}
                  </span>{" "}
                  次
                </p>
              </div>
            </CardContent>
            <CardFooter className="mt-auto flex-col items-stretch gap-2 border-t pt-4">
              {currentPlanId === plan.id ? (
                <Badge variant="secondary" className="w-fit">
                  当前套餐
                </Badge>
              ) : plan.id === "free" ? (
                <p className="text-muted-foreground text-xs">登录后默认包含；无需单独购买。</p>
              ) : null}
            </CardFooter>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>三档用量对照</CardTitle>
          <CardDescription>访客与登录后的两档订阅在每日配额上的差异。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-40">项目</TableHead>
                <TableHead className="text-center">{subscriptionCopy.guestColumnLabel}</TableHead>
                {plans.map((p) => (
                  <TableHead key={p.id} className="text-center">
                    {p.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>价格</TableCell>
                <TableCell className="text-center text-muted-foreground">—</TableCell>
                {plans.map((p) => (
                  <TableCell key={p.id} className="text-center">
                    {p.priceLabel}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell>{subscriptionCopy.tableDailyAnalysis}</TableCell>
                <TableCell className="text-center tabular-nums">
                  {GUEST_QUOTA.dailyStockAnalysis}
                </TableCell>
                {plans.map((p) => (
                  <TableCell key={p.id} className="text-center tabular-nums">
                    {p.dailyAnalysisLimit}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell>{subscriptionCopy.tablePickerSessions}</TableCell>
                <TableCell className="text-center tabular-nums">
                  {GUEST_QUOTA.dailyPickerSessions}
                </TableCell>
                {plans.map((p) => (
                  <TableCell key={p.id} className="text-center tabular-nums">
                    {p.pickerSessionDaily}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {currentPlanId !== "pro" ? (
        <Card>
          <CardHeader>
            <CardTitle>{subscriptionTierPublicCopy.checkoutProCardTitle}</CardTitle>
            <CardDescription>
              演示环境可按所选<strong className="text-foreground font-medium">月付</strong>、
              <strong className="text-foreground font-medium">季付</strong>或
              <strong className="text-foreground font-medium">年付</strong>
              模拟扣款与周期；正式环境以支付渠道回调、后台对账与订单为准。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground text-sm">计费周期</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={checkoutCycle === "month" ? "default" : "outline"}
                  onClick={() => setCheckoutCycle("month")}
                >
                  月付（{proPlan.settlementAmountLabel}/月）
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={checkoutCycle === "quarter" ? "default" : "outline"}
                  onClick={() => setCheckoutCycle("quarter")}
                >
                  季付（{proPlan.quarterlySettlementAmountLabel ?? "¥147"}/季）
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={checkoutCycle === "year" ? "default" : "outline"}
                  onClick={() => setCheckoutCycle("year")}
                >
                  年付（{proPlan.annualSettlementAmountLabel ?? "¥468"}/年）
                </Button>
              </div>
            </div>
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
              <Button disabled={!agree} onClick={startPay}>
                {subscriptionCopy.payCta}（{checkoutAmountLabel}/{cycleSuffix}）
              </Button>
              <Button type="button" variant="outline" onClick={recordFailed}>
                {subscriptionCopy.payFailSim}
              </Button>
              <Button type="button" variant="ghost" onClick={recordCancelled}>
                {subscriptionCopy.payCancelSim}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertTitle>{subscriptionTierPublicCopy.alreadyProAlertTitle}</AlertTitle>
          <AlertDescription>
            用量与到期日以当前状态卡片为准。如需变更续费策略，请在正式支付通道接入后于账户中心操作。
          </AlertDescription>
        </Alert>
      )}

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
                  <TableHead>套餐</TableHead>
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
              进入工作台
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

