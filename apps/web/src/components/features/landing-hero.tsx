"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { landingCopy } from "@/lib/copy";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSubscriptionStore, type PlanDef } from "@/stores/use-subscription-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

function LandingReportPreview() {
  return (
    <Card
      className="border-border/80 bg-card/95 shadow-sm lg:sticky lg:top-28"
      aria-label={landingCopy.previewTitle}
    >
      <CardHeader className="gap-1 border-b">
        <CardDescription className="font-mono text-xs tracking-tight">
          {landingCopy.previewMeta}
        </CardDescription>
        <CardTitle className="text-base">{landingCopy.previewTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 py-5">
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            {landingCopy.previewStatesLabel}
          </p>
          <p className="text-foreground font-mono text-xs leading-relaxed tracking-tight">
            {landingCopy.previewStatesLine}
          </p>
        </div>
        <div className="border-border border-t pt-4">
          <dl className="flex flex-col gap-3">
            {landingCopy.previewRows.map((label) => (
              <div
                key={label}
                className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-x-6"
              >
                <dt className="text-muted-foreground text-xs leading-snug">{label}</dt>
                <dd
                  className="text-muted-foreground font-mono text-xs tabular-nums sm:text-right"
                  aria-hidden
                >
                  {landingCopy.previewPlaceholder}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
      <CardFooter className="bg-muted/25 border-t py-3">
        <p className="text-muted-foreground text-xs leading-relaxed">{landingCopy.previewFootnote}</p>
      </CardFooter>
    </Card>
  );
}

function LandingPricingSection({ plans }: { plans: PlanDef[] }) {
  return (
    <section aria-labelledby="landing-pricing-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="landing-pricing-heading" className="text-foreground text-xl font-semibold tracking-tight">
          {landingCopy.pricingHeading}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">{landingCopy.pricingDesc}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={cn(
              "h-full",
              plan.id === "pro" ? "border-primary/30 shadow-sm" : "border-border/80",
            )}
          >
            <CardHeader className="gap-1">
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <CardDescription className="text-foreground text-xl font-semibold tabular-nums">
                {plan.priceLabel}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">
                每日股票预测：{plan.dailyAnalysisLimit >= 999 ? "不限" : `${plan.dailyAnalysisLimit} 次`}
              </p>
              <p className="text-muted-foreground">每日选股会话：{plan.pickerSessionDaily} 次</p>
              <p className="text-muted-foreground">权益说明：{plan.features[0]}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div>
        <Button variant="outline" render={<Link href="/subscription" />}>
          {landingCopy.pricingCta}
        </Button>
      </div>
    </section>
  );
}

export function LandingHero() {
  const session = useAuthStore((s) => s.session);
  const plans = useSubscriptionStore((s) => s.plans);
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
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    );
  }

  if (session === "user") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-muted-foreground text-sm">正在进入工作台…</p>
      </div>
    );
  }

  return (
    <div className="bg-background border-border/60 border-b">
      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-14 md:px-6 md:py-18 lg:py-22">
        <div className="grid items-start gap-14 lg:grid-cols-12 lg:gap-16">
          <div
            className="flex flex-col gap-7 lg:col-span-7"
            aria-labelledby="landing-hero-title"
          >
            <div className="flex flex-col gap-5">
              <p className="text-muted-foreground text-xs font-medium tracking-wide">
                {landingCopy.brandLine}
              </p>
              <h1
                id="landing-hero-title"
                className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl lg:leading-tight"
              >
                {landingCopy.heroTitle}
              </h1>
              <div className="text-muted-foreground flex max-w-xl flex-col gap-2 leading-relaxed">
                <p className="text-base md:text-lg">{landingCopy.heroLead}</p>
                <p className="text-sm">{landingCopy.heroSupport}</p>
              </div>
              <p className="text-muted-foreground max-w-xl text-xs leading-relaxed">
                {landingCopy.heroBoundary}
              </p>
            </div>

            <section aria-labelledby="landing-highlights-heading" className="flex flex-col gap-3">
              <h2
                id="landing-highlights-heading"
                className="text-muted-foreground text-xs font-semibold tracking-wide"
              >
                {landingCopy.highlightsHeading}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-3">
                {landingCopy.highlights.map((item) => (
                  <li key={item.label} className="border-border rounded-lg border p-3">
                    <p className="text-muted-foreground text-xs">{item.label}</p>
                    <p className="text-foreground mt-1 text-sm font-medium">{item.value}</p>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="sm:min-w-44" render={<Link href="/app/analyze" />}>
                {landingCopy.heroCtaPrimary}
              </Button>
              <Button className="sm:min-w-44" variant="secondary" render={<Link href="/app/pick" />}>
                {landingCopy.heroCtaSecondary}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" className="px-0 text-sm" render={<Link href="/login" />}>
                {landingCopy.heroCtaLogin}
              </Button>
              <span className="text-muted-foreground text-xs">·</span>
              <Button variant="ghost" className="px-0 text-sm" render={<Link href="/subscription" />}>
                {landingCopy.heroCtaSubscription}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-5 lg:pt-2">
            <LandingReportPreview />
            <Button variant="ghost" className="justify-start px-0 text-sm" render={<Link href="/welcome" />}>
              {landingCopy.ctaSecondaryOutline}
            </Button>
          </div>
        </div>

        <section aria-labelledby="landing-pillars-heading" className="flex flex-col gap-6 pt-2">
          <h2 id="landing-pillars-heading" className="text-foreground text-xl font-semibold tracking-tight">
            {landingCopy.pillarsHeading}
          </h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {landingCopy.pillars.map((line, i) => (
              <li key={line} className="flex gap-3">
                <span className="text-muted-foreground font-mono text-xs tabular-nums pt-0.5">
                    {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-sm leading-relaxed">{line}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="border-border border-t pt-10">
          <LandingPricingSection plans={plans} />
        </div>

        <section aria-labelledby="landing-faq-heading" className="border-border flex flex-col gap-4 border-t pt-10">
          <h2 id="landing-faq-heading" className="text-foreground text-lg font-semibold tracking-tight">
            {landingCopy.faqHeading}
          </h2>
          <Accordion>
            {landingCopy.faqItems.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <Collapsible className="border-border border-t pt-8">
          <CollapsibleTrigger
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
    </div>
  );
}
