"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon, MessagesSquareIcon, HistoryIcon, ShieldCheckIcon } from "lucide-react";
import { landingCopy, subscriptionCopy } from "@/lib/copy";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAuthStore } from "@/stores/use-auth-store";
import { GUEST_QUOTA } from "@/stores/use-subscription-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const featureIcons = [FileTextIcon, MessagesSquareIcon, HistoryIcon, ShieldCheckIcon] as const;

function LandingReportPreview() {
  return (
    <aside aria-labelledby="landing-report-preview-heading">
      <h2 id="landing-report-preview-heading" className="sr-only">
        {landingCopy.previewTitle}
      </h2>
      <div className="border-border/80 bg-card/95 overflow-hidden rounded-xl border text-left shadow-sm">
        <div className="bg-muted/50 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="bg-red-500/80 inline-flex size-2 rounded-full" aria-hidden />
            <span className="bg-amber-500/80 inline-flex size-2 rounded-full" aria-hidden />
            <span className="bg-emerald-500/80 inline-flex size-2 rounded-full" aria-hidden />
            <span className="text-muted-foreground/90 ml-2 text-[11px] font-medium tracking-wide">
              Report Preview
            </span>
          </div>
        </div>
        <Card className="rounded-none border-0 bg-transparent shadow-none">
          <CardHeader className="gap-2 border-b pb-4">
            <CardTitle className="text-base">{landingCopy.previewTitle}</CardTitle>
            <p className="text-muted-foreground text-xs font-mono">CN.600519 · 2026-04-20 14:30 · 日线</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 py-5">
            <div className="rounded-lg border bg-muted/25 px-3 py-2.5">
              <p className="text-muted-foreground mb-2 text-xs font-medium">建议动作</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>加仓</Badge>
                <span className="text-muted-foreground text-xs">置信度 78</span>
                <span className="text-muted-foreground text-xs">风险：中等</span>
              </div>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                趋势延续且量价配合，短期回撤未破关键支撑，维持正向偏多判断。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border px-2.5 py-2">
                <p className="text-muted-foreground text-[11px]">综合评分</p>
                <p className="text-foreground mt-1 text-sm font-semibold tabular-nums">82 / 100</p>
              </div>
              <div className="rounded-md border px-2.5 py-2">
                <p className="text-muted-foreground text-[11px]">建议仓位</p>
                <p className="text-foreground mt-1 text-sm font-semibold tabular-nums">35% - 45%</p>
              </div>
              <div className="rounded-md border px-2.5 py-2">
                <p className="text-muted-foreground text-[11px]">有效期</p>
                <p className="text-foreground mt-1 text-sm font-semibold tabular-nums">2 - 4 交易日</p>
              </div>
            </div>
            <div className="border-border border-t pt-3">
              <dl className="flex flex-col gap-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
                  <dt className="text-muted-foreground text-xs">关注区间</dt>
                  <dd className="text-foreground/90 font-mono text-xs tabular-nums">1548 - 1588</dd>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
                  <dt className="text-muted-foreground text-xs">风险位</dt>
                  <dd className="text-foreground/90 font-mono text-xs tabular-nums">1526</dd>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
                  <dt className="text-muted-foreground text-xs">观察目标</dt>
                  <dd className="text-foreground/90 font-mono text-xs tabular-nums">1628 / 1660</dd>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
                  <dt className="text-muted-foreground text-xs">失效条件</dt>
                  <dd className="text-foreground/90 font-mono text-xs tabular-nums">日线收于 1526 下方</dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>
      </div>
    </aside>
  );
}

function LandingFeaturesSection() {
  const [analysisFeature, strategyFeature, reviewFeature, governanceFeature] = landingCopy.features;
  const [step1, step2, step3] = landingCopy.howItWorksSteps;
  const AnalysisIcon = featureIcons[0] ?? FileTextIcon;
  const StrategyIcon = featureIcons[1] ?? FileTextIcon;
  const ReviewIcon = featureIcons[2] ?? FileTextIcon;
  const GovernanceIcon = featureIcons[3] ?? FileTextIcon;

  return (
    <section
      id="landing-features"
      aria-labelledby="landing-features-heading"
      className="border-border scroll-mt-28 border-t bg-muted/25 py-16 md:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <h2 id="landing-features-heading" className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl">
            {landingCopy.featuresHeading}
          </h2>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">{landingCopy.featuresSectionLead}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Card className="border-border/70 bg-background/70 h-full rounded-2xl shadow-none lg:min-h-[540px]">
            <CardHeader className="gap-4 pb-4">
              <span className="bg-background text-muted-foreground inline-flex size-10 items-center justify-center rounded-xl border">
                <AnalysisIcon className="size-5" aria-hidden />
              </span>
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs tracking-wide">{analysisFeature.scope}</p>
                <CardTitle className="text-foreground text-2xl leading-tight">{analysisFeature.title}</CardTitle>
                <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                  {analysisFeature.description}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <p className="text-muted-foreground text-xs leading-relaxed">
                <span className="text-foreground font-medium">主要交付：</span>
                {analysisFeature.deliverable}
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                <span className="text-foreground font-medium">适用场景：</span>
                {analysisFeature.useCase}
              </p>
            </CardContent>
            <CardFooter className="mt-auto">
              <Button size="sm" className="w-full" render={<Link href="/app/analyze" />}>
                查看分析工作台
              </Button>
            </CardFooter>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-border/70 bg-background/70 h-full rounded-2xl shadow-none">
              <CardHeader className="gap-2 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="bg-background text-muted-foreground inline-flex size-8 items-center justify-center rounded-lg border">
                    <StrategyIcon className="size-4" aria-hidden />
                  </span>
                  <span className="text-muted-foreground/80 font-mono text-xs">02</span>
                </div>
                <CardTitle className="text-foreground text-lg">{strategyFeature.title}</CardTitle>
                <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                  {strategyFeature.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span className="text-foreground font-medium">主要交付：</span>
                  {strategyFeature.deliverable}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-background/70 h-full rounded-2xl shadow-none">
              <CardContent className="flex min-h-[188px] flex-col justify-center px-5 py-5">
                <p className="text-muted-foreground text-xs">覆盖工作流</p>
                <p className="text-foreground mt-2 text-6xl font-semibold tracking-tight tabular-nums">4</p>
                <p className="text-muted-foreground mt-2 text-sm">分析 · 生成 · 追踪 · 治理</p>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-background/70 h-full rounded-2xl shadow-none">
              <CardHeader className="gap-2 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="bg-background text-muted-foreground inline-flex size-8 items-center justify-center rounded-lg border">
                    <ReviewIcon className="size-4" aria-hidden />
                  </span>
                  <span className="text-muted-foreground/80 font-mono text-xs">03</span>
                </div>
                <CardTitle className="text-foreground text-lg">{reviewFeature.title}</CardTitle>
                <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                  {reviewFeature.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span className="text-foreground font-medium">主要交付：</span>
                  {reviewFeature.deliverable}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-background/70 h-full rounded-2xl shadow-none">
              <CardHeader className="gap-2 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="bg-background text-muted-foreground inline-flex size-8 items-center justify-center rounded-lg border">
                    <GovernanceIcon className="size-4" aria-hidden />
                  </span>
                  <span className="text-muted-foreground/80 font-mono text-xs">04</span>
                </div>
                <CardTitle className="text-foreground text-lg">{governanceFeature.title}</CardTitle>
                <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                  {governanceFeature.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span className="text-foreground font-medium">主要交付：</span>
                  {governanceFeature.deliverable}
                </p>
              </CardContent>
            </Card>

            <Card id="landing-how" className="border-border/70 bg-background/70 rounded-2xl shadow-none sm:col-span-2">
              <CardHeader className="gap-2 pb-3">
                <CardTitle className="text-foreground text-lg">{landingCopy.howItWorksHeading}</CardTitle>
                <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                  {landingCopy.howItWorksLead}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="grid list-none gap-2 p-0 md:grid-cols-3">
                  {[step1, step2, step3].map((step, i) => (
                    <li key={step.title} className="border-border/70 rounded-lg border px-3 py-2.5">
                      <p className="text-muted-foreground font-mono text-[11px] tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </p>
                      <p className="text-foreground mt-1 text-sm font-medium leading-snug">{step.title}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingPricingSection() {
  return (
    <section
      id="landing-pricing"
      aria-labelledby="landing-pricing-heading"
      className="border-border scroll-mt-28 border-t bg-muted/30 py-16 md:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <h2
            id="landing-pricing-heading"
            className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl"
          >
            {landingCopy.pricingHeading}
          </h2>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">
            {landingCopy.pricingDesc}
          </p>
        </div>

        <div className="mx-auto mb-8 grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {landingCopy.pricingBillingOptions.map((item) => {
            const featured = item.name === "年付";
            const freeTier = item.name === "免费使用";
            return (
              <Card
                key={item.name}
                className={cn(
                  "relative flex h-full flex-col border bg-background/90 shadow-sm transition-all",
                  featured
                    ? "border-primary/45 ring-primary/20 shadow-md ring-1"
                    : "border-border/80 hover:border-border hover:shadow-md",
                )}
              >
                {featured ? (
                  <div className="absolute right-3 top-3">
                    <Badge>{landingCopy.pricingBadgePro}</Badge>
                  </div>
                ) : null}
                <CardHeader className="gap-2 pb-3">
                  <p className="text-muted-foreground text-xs tracking-wide">{freeTier ? "基础档" : "专业版"}</p>
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  <CardDescription className="min-h-10 text-sm leading-relaxed">{item.description}</CardDescription>
                  <div className="pt-1">
                    <p className="text-foreground text-2xl font-semibold tabular-nums tracking-tight">{item.price}</p>
                    <p className="text-muted-foreground mt-1 text-xs">{item.note}</p>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 border-t pt-4">
                  <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm leading-relaxed">
                    {item.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button
                    className="w-full"
                    size={featured ? "lg" : "default"}
                    variant={freeTier ? "outline" : "default"}
                    render={<Link href="/subscription" />}
                  >
                    {item.cta}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <div className="border-border bg-background/80 mx-auto mb-10 max-w-5xl rounded-xl border px-4 py-4 text-center shadow-sm md:px-6">
          <p className="text-muted-foreground text-xs leading-relaxed md:text-sm">
            <span className="text-foreground font-medium">{subscriptionCopy.guestColumnLabel}</span>
            ：每日股票预测{" "}
            <span className="text-foreground font-medium tabular-nums">{GUEST_QUOTA.dailyStockAnalysis}</span>{" "}
            次、选股会话{" "}
            <span className="text-foreground font-medium tabular-nums">{GUEST_QUOTA.dailyPickerSessions}</span>{" "}
            次。登录后为免费版日配额；需要更高额度时在订阅页开通专业版。
          </p>
        </div>

        <p className="text-muted-foreground mx-auto mt-10 max-w-2xl text-center text-xs leading-relaxed md:text-sm">
          {landingCopy.pricingFootnote}{" "}
          <Button
            variant="link"
            className="text-muted-foreground hover:text-foreground h-auto p-0 align-baseline text-xs md:text-sm"
            render={<Link href="/subscription" />}
          >
            {landingCopy.pricingCta}
          </Button>
        </p>
      </div>
    </section>
  );
}

export function LandingHero() {
  const session = useAuthStore((s) => s.session);
  const router = useRouter();
  const authHydrated = useStoreHydrated(useAuthStore);

  useEffect(() => {
    if (!authHydrated) return;
    if (session === "user") {
      router.replace("/app/analyze");
    }
  }, [authHydrated, session, router]);

  if (!authHydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4" role="status" aria-live="polite">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    );
  }

  if (session === "user") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4" role="status" aria-live="polite">
        <p className="text-muted-foreground text-sm">正在进入工作台…</p>
      </div>
    );
  }

  return (
    <div className="bg-background">
      <section
        aria-labelledby="landing-hero-title"
        className="border-border/60 relative border-b bg-linear-to-b from-muted/35 via-background to-background pb-14 pt-10 md:pb-20 md:pt-14"
      >
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
          <div className="flex max-w-xl flex-col items-center text-center lg:items-start lg:text-left">
            <h1
              id="landing-hero-title"
              className="text-foreground text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-[3.35rem] md:leading-[1.06]"
            >
              <span className="block">{landingCopy.heroTitleLine1}</span>
              <span className="block">{landingCopy.heroTitleLine2}</span>
            </h1>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">
              {landingCopy.heroLead}
            </p>

            <div className="mt-7 flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap lg:justify-start">
              <Button className="min-w-44 px-8 shadow-sm" size="lg" render={<Link href="/app/analyze" />}>
                {landingCopy.heroCtaPrimary}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs lg:justify-start">
              <Button className="h-auto p-0 text-xs" variant="link" render={<Link href="/#landing-how" scroll />}>
                {landingCopy.heroCtaSecondary}
              </Button>
              <span className="text-muted-foreground/60">·</span>
              <Button variant="link" className="h-auto p-0 text-xs font-medium" render={<Link href="/login" />}>
                {landingCopy.heroCtaLogin}
              </Button>
              <span className="text-muted-foreground/60">·</span>
              <span className="text-muted-foreground/90">{landingCopy.heroEyebrow}</span>
            </div>

            <div className="mt-8 w-full max-w-md lg:hidden">
              <LandingReportPreview />
            </div>
          </div>

          <div className="hidden lg:flex lg:h-fit lg:flex-col">
            <LandingReportPreview />
          </div>
        </div>
      </section>

      <LandingFeaturesSection />

      <LandingPricingSection />

      <section
        id="landing-faq"
        aria-labelledby="landing-faq-heading"
        className="border-border scroll-mt-28 border-t py-16 md:py-20"
      >
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 id="landing-faq-heading" className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
              {landingCopy.faqHeading}
            </h2>
          </div>
          <div className="mx-auto mt-10 max-w-3xl">
            <Accordion className="space-y-3">
              {landingCopy.faqItems.map((item) => (
                <AccordionItem
                  key={item.q}
                  value={item.q}
                  className="border-border/70 bg-background/70 rounded-lg border px-4 transition-colors hover:bg-background/90"
                >
                  <AccordionTrigger className="py-4 text-left">
                    <span className="flex items-start gap-3">
                      <span className="bg-foreground text-background mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded text-[10px] font-semibold">
                        Q
                      </span>
                      <span className="text-foreground text-sm font-semibold leading-relaxed md:text-base">
                        {item.q}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="flex items-start gap-3">
                      <span className="bg-muted text-muted-foreground mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded text-[10px] font-semibold">
                        A
                      </span>
                      <p className="text-muted-foreground text-sm leading-relaxed md:text-[15px]">{item.a}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="landing-compliance-trigger"
        className="border-border bg-muted/15 border-t py-10"
      >
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <Collapsible>
            <CollapsibleTrigger
              id="landing-compliance-trigger"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground hover:text-foreground h-auto px-0 py-1 text-xs",
              )}
            >
              {landingCopy.complianceTrigger}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <Alert className="border-border/80">
                <AlertTitle className="text-sm">{landingCopy.complianceTitle}</AlertTitle>
                <AlertDescription className="text-muted-foreground text-xs leading-relaxed">
                  {landingCopy.complianceBody}
                </AlertDescription>
              </Alert>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </section>
    </div>
  );
}
