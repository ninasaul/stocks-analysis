"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FileTextIcon, MessagesSquareIcon, HistoryIcon, SparklesIcon } from "lucide-react";
import { landingCopy, subscriptionCopy } from "@/lib/copy";
import { GUEST_QUOTA } from "@/stores/use-subscription-store";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FallingPattern } from "@/components/features/falling-pattern";

const featureIcons = [FileTextIcon, MessagesSquareIcon, HistoryIcon, SparklesIcon] as const;
const howItWorksSteps = [
  {
    icon: SparklesIcon,
    title: "Step 01 · 识别意图",
    description: "自动判断你是要研判个股，还是先筛后研，匹配最佳流程。",
  },
  {
    icon: MessagesSquareIcon,
    title: "Step 02 · 对话收敛",
    description: "补齐风险偏好、持有周期等关键条件，直到方向清晰可执行。",
  },
  {
    icon: FileTextIcon,
    title: "Step 03 · 生成报告",
    description: "输出结构化内容：评分、风险等级、关键价位、失效条件。",
  },
  {
    icon: HistoryIcon,
    title: "Step 04 · 存入复盘",
    description: "建议自动沉淀到历史记录，随时按同一口径回看与验证。",
  },
] as const;

const HERO_TYPE_MS = 52;
const HERO_TYPE_LINE_PAUSE_MS = 380;

function HeroTypewriterTitle({
  line1,
  line2,
  id,
  className,
}: {
  line1: string;
  line2: string;
  id: string;
  className?: string;
}) {
  const [line1Shown, setLine1Shown] = useState(line1);
  const [line2Shown, setLine2Shown] = useState(line2);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setLine1Shown("");
    setLine2Shown("");
  }, [line1, line2]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const clearTimers = () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
    clearTimers();

    let i1 = 0;
    let i2 = 0;
    let phase: "line1" | "pause" | "line2" | "done" = "line1";

    const schedule = (fn: () => void, ms: number) => {
      timersRef.current.push(setTimeout(fn, ms));
    };

    const tick = () => {
      if (phase === "line1") {
        if (i1 < line1.length) {
          i1 += 1;
          setLine1Shown(line1.slice(0, i1));
          schedule(tick, HERO_TYPE_MS);
        } else {
          phase = "pause";
          schedule(tick, HERO_TYPE_LINE_PAUSE_MS);
        }
        return;
      }
      if (phase === "pause") {
        phase = "line2";
        tick();
        return;
      }
      if (phase === "line2") {
        if (i2 < line2.length) {
          i2 += 1;
          setLine2Shown(line2.slice(0, i2));
          schedule(tick, HERO_TYPE_MS);
        } else {
          phase = "done";
        }
      }
    };

    schedule(tick, 120);
    return clearTimers;
  }, [line1, line2]);

  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const complete = line1Shown.length === line1.length && line2Shown.length === line2.length;
  const showCaret = !reduced && !complete;

  return (
    <h1
      id={id}
      aria-label={`${line1} ${line2}`}
      className={cn("landing-hero-in text-foreground text-balance text-4xl leading-[1.18] font-semibold tracking-tight sm:text-5xl md:text-[3.35rem] md:leading-[1.2]", className)}
    >
      <span aria-hidden className="inline-block text-left">
        <span className="block">
          {line1Shown}
          {showCaret && line1Shown.length < line1.length ? (
            <span
              className="bg-foreground/85 ml-px inline-block w-[2px] shrink-0 align-[-0.08em] motion-safe:animate-pulse motion-reduce:animate-none md:h-[1.06em] md:align-[-0.06em]"
              style={{ height: "1em" }}
              aria-hidden
            />
          ) : null}
        </span>
        <span className="block">
          {line2Shown}
          {showCaret && line1Shown.length === line1.length && line2Shown.length < line2.length ? (
            <span
              className="bg-foreground/85 ml-px inline-block w-[2px] shrink-0 align-[-0.08em] motion-safe:animate-pulse motion-reduce:animate-none md:h-[1.06em] md:align-[-0.06em]"
              style={{ height: "1em" }}
              aria-hidden
            />
          ) : null}
        </span>
      </span>
    </h1>
  );
}

/** 进入视口后淡入上移；尊重系统「减少动态效果」。 */
function LandingReveal({ children, className, delayMs = 0 }: { children: ReactNode; className?: string; delayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px 0px 0px", threshold: 0.04 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className,
      )}
      style={visible && delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

const landingCardMotion =
  "motion-safe:transition-[box-shadow,transform,border-color] motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md";

function LandingReportPreview() {
  return (
    <aside aria-labelledby="landing-report-preview-heading">
      <h2 id="landing-report-preview-heading" className="sr-only">
        {landingCopy.previewTitle}
      </h2>
      <div className="group border-border/45 bg-card/80 overflow-hidden rounded-xl border text-left shadow-sm backdrop-blur-md supports-backdrop-filter:bg-card/58 motion-safe:transition-[transform,box-shadow,border-color,background-color] motion-safe:duration-450 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:hover:-translate-y-1 motion-safe:hover:scale-[1.012] motion-safe:hover:shadow-xl motion-safe:hover:border-primary/40 motion-safe:hover:bg-card/86 supports-backdrop-filter:motion-safe:hover:bg-card/62">
        <div className="border-border/35 border-b bg-muted/45 px-3 py-1.5 backdrop-blur-sm supports-backdrop-filter:bg-muted/32 motion-safe:transition-colors motion-safe:duration-300 group-hover:bg-primary/5">
          <div className="flex items-center gap-2">
            <span className="bg-red-500/80 inline-flex size-2 rounded-full" aria-hidden />
            <span className="bg-amber-500/80 inline-flex size-2 rounded-full" aria-hidden />
            <span className="bg-emerald-500/80 inline-flex size-2 rounded-full" aria-hidden />
            <span className="text-muted-foreground/90 ml-2 text-[11px] font-medium tracking-wide">
              股票研究报告预览
            </span>
          </div>
        </div>
        <Card className="rounded-none border-0 bg-transparent shadow-none">
          <CardHeader className="gap-1 border-b border-border/35 pb-2">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">贵州茅台（600519.SH）</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                <span>A股 · 日线</span>
                <span>收盘后数据</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-1.5 pb-4">
            <div className="rounded-lg border border-border/40 bg-muted/25 px-2.5 py-2 motion-safe:transition-[background-color,border-color] motion-safe:duration-300 group-hover:border-primary/30 group-hover:bg-primary/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs font-medium">结论倾向</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge>偏多观察</Badge>
                    <span className="text-muted-foreground text-xs">风险：中等</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-[11px]">综合评分</p>
                  <p className="text-foreground mt-0.5 font-mono text-lg font-semibold tabular-nums motion-safe:transition-colors motion-safe:duration-300 group-hover:text-primary">84</p>
                </div>
              </div>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                趋势向上，成交温和放大；回踩未破 10 日均线，偏多观点维持，回撤可分批介入。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-md border border-border/35 px-2 py-1.5 motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-300 group-hover:border-primary/20 group-hover:bg-muted/35 motion-safe:group-hover:-translate-y-0.5">
                <p className="text-muted-foreground text-[11px]">参考价</p>
                <p className="text-foreground mt-1 text-sm font-semibold tabular-nums">1642.38</p>
              </div>
              <div className="rounded-md border border-border/35 px-2 py-1.5 motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-300 group-hover:border-primary/20 group-hover:bg-muted/35 motion-safe:group-hover:-translate-y-0.5">
                <p className="text-muted-foreground text-[11px]">日涨跌</p>
                <p className="text-foreground mt-1 text-sm font-semibold tabular-nums">+1.76%</p>
              </div>
              <div className="rounded-md border border-border/35 px-2 py-1.5 motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-300 group-hover:border-primary/20 group-hover:bg-muted/35 motion-safe:group-hover:-translate-y-0.5">
                <p className="text-muted-foreground text-[11px]">成交额</p>
                <p className="text-foreground mt-1 text-sm font-semibold tabular-nums">42.7 亿</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-md border border-border/35 bg-background/45 px-2 py-1.5 motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-300 group-hover:border-primary/20 group-hover:bg-background/70 motion-safe:group-hover:-translate-y-0.5">
                <p className="text-muted-foreground text-[11px]">关注区间</p>
                <p className="text-foreground mt-1 font-mono text-xs font-semibold tabular-nums">1628 - 1665</p>
              </div>
              <div className="rounded-md border border-border/35 bg-background/45 px-2 py-1.5 motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-300 group-hover:border-primary/20 group-hover:bg-background/70 motion-safe:group-hover:-translate-y-0.5">
                <p className="text-muted-foreground text-[11px]">风险位</p>
                <p className="text-foreground mt-1 font-mono text-xs font-semibold tabular-nums">1598</p>
              </div>
              <div className="rounded-md border border-border/35 bg-background/45 px-2 py-1.5 motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-300 group-hover:border-primary/20 group-hover:bg-background/70 motion-safe:group-hover:-translate-y-0.5">
                <p className="text-muted-foreground text-[11px]">观察目标</p>
                <p className="text-foreground mt-1 font-mono text-xs font-semibold tabular-nums">1688 / 1720</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/35 px-2.5 py-2.5 motion-safe:transition-[background-color,border-color] motion-safe:duration-300 group-hover:border-primary/20 group-hover:bg-muted/20">
              <p className="text-foreground text-xs font-medium">判断依据</p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-xs leading-relaxed marker:text-muted-foreground/50">
                <li>均线结构维持多头排列，短线回踩未破关键支撑。</li>
                <li>成交额较 5 日均值温和放大，价格上行动能仍在。</li>
                <li>若跌破风险位，当前偏多假设失效，需要重新评估。</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border/35 bg-muted/20 px-2.5 py-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                <p className="text-muted-foreground text-xs">失效条件</p>
                <p className="text-foreground/90 font-mono text-xs tabular-nums">日线收于 1598 下方</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-border/35 px-3 py-1.5">
            <p className="w-full text-center text-muted-foreground text-[11px] font-medium tracking-wide">
              以下为示例数据，非实时行情
            </p>
          </CardFooter>
        </Card>
      </div>
    </aside>
  );
}

function LandingFeaturesSection() {
  const [analysisFeature, strategyFeature, reviewFeature, governanceFeature] = landingCopy.features;
  const AnalysisIcon = featureIcons[0] ?? FileTextIcon;
  const StrategyIcon = featureIcons[1] ?? FileTextIcon;
  const ReviewIcon = featureIcons[2] ?? FileTextIcon;
  const GovernanceIcon = featureIcons[3] ?? FileTextIcon;

  return (
    <section
      id="landing-features"
      aria-labelledby="landing-features-heading"
      className="scroll-mt-28 border-t border-border/35 bg-muted/25 py-16 md:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <LandingReveal>
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <h2 id="landing-features-heading" className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl">
              {landingCopy.featuresHeading}
            </h2>
            <p className="text-foreground mt-3 text-xl font-semibold tracking-tight md:text-2xl">
              {landingCopy.featuresTitle}
            </p>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">{landingCopy.featuresSectionLead}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {landingCopy.featuresTags.map((tag) => (
                <Badge key={tag} variant="outline" className="bg-background/60">
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-xs leading-relaxed">
              {landingCopy.featuresDisclaimer}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Card
              className={cn(
                landingCardMotion,
                "border-border/45 bg-background/70 h-full rounded-2xl shadow-none lg:min-h-[540px]",
              )}
            >
              <CardHeader className="gap-4 pb-4">
                <span className="bg-background text-muted-foreground inline-flex size-10 items-center justify-center rounded-xl border border-border/40">
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
                  <span className="text-foreground font-medium">交付：</span>
                  {analysisFeature.deliverable}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span className="text-foreground font-medium">适用场景：</span>
                  {analysisFeature.useCase}
                </p>
              </CardContent>
              <CardFooter className="mt-auto">
                <div className="w-full space-y-2">
                  <Button size="sm" className="w-full" render={<Link href="/app/analyze" />}>
                    {landingCopy.featuresAnalyzeCta}
                  </Button>
                  <p className="text-muted-foreground text-center text-xs leading-relaxed">
                    {landingCopy.featuresCtaHint}
                  </p>
                </div>
              </CardFooter>
            </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className={cn(landingCardMotion, "border-border/45 bg-background/70 h-full rounded-2xl shadow-none")}>
              <CardHeader className="gap-2 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="bg-background text-muted-foreground inline-flex size-8 items-center justify-center rounded-lg border border-border/40">
                    <StrategyIcon className="size-4" aria-hidden />
                  </span>
                  <span className="text-muted-foreground/80 font-mono text-xs">02 ·</span>
                </div>
                <CardTitle className="text-foreground text-lg">{strategyFeature.title}</CardTitle>
                <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                  {strategyFeature.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span className="text-foreground font-medium">交付：</span>
                  {strategyFeature.deliverable}
                </p>
              </CardContent>
            </Card>

            <Card className={cn(landingCardMotion, "border-border/45 bg-background/70 h-full rounded-2xl shadow-none")}>
              <CardContent className="flex min-h-[188px] flex-col justify-center px-5 py-5">
                <p className="text-muted-foreground text-xs">{landingCopy.featuresMatrixSummary.label}</p>
                <p className="text-foreground mt-2 text-6xl font-semibold tracking-tight tabular-nums">
                  {landingCopy.featuresMatrixSummary.value}
                </p>
                <p className="text-muted-foreground mt-2 text-sm">{landingCopy.featuresMatrixSummary.caption}</p>
              </CardContent>
            </Card>

            <Card className={cn(landingCardMotion, "border-border/45 bg-background/70 h-full rounded-2xl shadow-none")}>
              <CardHeader className="gap-2 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="bg-background text-muted-foreground inline-flex size-8 items-center justify-center rounded-lg border border-border/40">
                    <ReviewIcon className="size-4" aria-hidden />
                  </span>
                  <span className="text-muted-foreground/80 font-mono text-xs">03 ·</span>
                </div>
                <CardTitle className="text-foreground text-lg">{reviewFeature.title}</CardTitle>
                <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                  {reviewFeature.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span className="text-foreground font-medium">交付：</span>
                  {reviewFeature.deliverable}
                </p>
              </CardContent>
            </Card>

            <Card className={cn(landingCardMotion, "border-border/45 bg-background/70 h-full rounded-2xl shadow-none")}>
              <CardHeader className="gap-2 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="bg-background text-muted-foreground inline-flex size-8 items-center justify-center rounded-lg border border-border/40">
                    <GovernanceIcon className="size-4" aria-hidden />
                  </span>
                  <span className="text-muted-foreground/80 font-mono text-xs">04 ·</span>
                </div>
                <CardTitle className="text-foreground text-lg">{governanceFeature.title}</CardTitle>
                <CardDescription className="text-muted-foreground text-sm leading-relaxed">
                  {governanceFeature.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span className="text-foreground font-medium">交付：</span>
                  {governanceFeature.deliverable}
                </p>
              </CardContent>
            </Card>

            <Card
              id="landing-how"
              className={cn(
                landingCardMotion,
                "scroll-mt-28 border-border/45 bg-background/70 rounded-2xl shadow-none sm:col-span-2",
              )}
            >
              <CardHeader className="gap-2 pb-2">
                <CardTitle className="text-foreground text-lg">{landingCopy.howItWorksHeading}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <p className="text-muted-foreground text-sm leading-relaxed">{landingCopy.howItWorksBody}</p>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {howItWorksSteps.map((step) => {
                    const Icon = step.icon;
                    return (
                      <li key={step.title} className="rounded-lg border border-border/35 bg-background/55 p-3">
                        <div className="flex items-start gap-2.5">
                          <span className="bg-background text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40">
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <div className="space-y-1">
                            <p className="text-foreground text-sm font-medium leading-none">{step.title}</p>
                            <p className="text-muted-foreground text-xs leading-relaxed">{step.description}</p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
        </LandingReveal>
      </div>
    </section>
  );
}

function LandingPricingSection() {
  return (
    <section
      id="landing-pricing"
      aria-labelledby="landing-pricing-heading"
      className="scroll-mt-28 border-t border-border/35 bg-muted/30 py-16 md:py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <LandingReveal>
          <header className="mx-auto mb-10 max-w-3xl text-center">
            <h2
              id="landing-pricing-heading"
              className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl"
            >
              {landingCopy.pricingHeading}
            </h2>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">{landingCopy.pricingDesc}</p>
          </header>

          <ul
            role="list"
            className="grid w-full list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3"
          >
            {landingCopy.pricingBillingOptions.map((item) => {
              const featured = item.name === "年付";
              const freeTier = item.name === "免费使用";
              return (
                <li key={item.name} className="min-w-0">
                  <article
                    className={cn(
                      landingCardMotion,
                      "relative flex h-full min-h-full flex-col gap-3 rounded-xl border border-border/40 bg-background/95 p-4 transition-colors",
                      featured
                        ? "border-primary/40 shadow-sm"
                        : "hover:border-border/70 hover:shadow-sm",
                    )}
                  >
                    {featured ? (
                      <Badge className="absolute right-2.5 top-2.5">{landingCopy.pricingBadgePro}</Badge>
                    ) : null}
                    <div className="pr-14">
                      <p className="text-muted-foreground text-xs tracking-wide">{freeTier ? "基础档" : "专业版"}</p>
                      <h3 className="text-foreground mt-1 text-base font-medium">{item.name}</h3>
                      <p className="text-muted-foreground mt-1 min-h-10 text-sm leading-relaxed">{item.description}</p>
                      <p className="text-foreground mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                        {item.price}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">{item.note}</p>
                    </div>
                    <ul className="text-muted-foreground mt-auto list-disc space-y-1.5 border-t border-border/25 pt-3 pl-4 text-sm leading-relaxed marker:text-muted-foreground/50">
                      {item.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      size={featured ? "lg" : "default"}
                      variant={freeTier ? "outline" : "default"}
                      render={<Link href="/subscription" />}
                    >
                      {item.cta}
                    </Button>
                  </article>
                </li>
              );
            })}
          </ul>

          <p className="text-muted-foreground mx-auto mt-10 max-w-4xl border-t border-border/25 pt-8 text-center text-xs leading-relaxed md:text-sm">
            <span className="text-foreground font-medium">{subscriptionCopy.guestColumnLabel}</span>
            ：每日股票预测{" "}
            <span className="text-foreground font-medium tabular-nums">{GUEST_QUOTA.dailyStockAnalysis}</span> 次、选股会话{" "}
            <span className="text-foreground font-medium tabular-nums">{GUEST_QUOTA.dailyPickerSessions}</span> 次。
            {landingCopy.pricingBelowPlansNote}{" "}
            <Button
              variant="link"
              className="text-muted-foreground hover:text-foreground h-auto p-0 align-baseline text-xs md:text-sm"
              render={<Link href="/subscription" />}
            >
              {landingCopy.pricingCta}
            </Button>
          </p>
        </LandingReveal>
      </div>
    </section>
  );
}

export function LandingHero() {
  return (
    <div className="bg-background">
      <section
        aria-labelledby="landing-hero-title"
        className="relative isolate flex min-h-[72vh] flex-col overflow-hidden border-b border-border/35 md:min-h-[78vh]"
      >
        <div className="pointer-events-none absolute inset-0 z-0 min-h-full" aria-hidden>
          <FallingPattern className="h-full min-h-full p-0" blurIntensity="0.9em" duration={160} />
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-1 h-28 bg-linear-to-t from-background to-transparent md:h-36"
          aria-hidden
        />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-4 py-16 md:px-6 md:py-24 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:gap-10">
          <div className="flex max-w-xl flex-col items-center text-center lg:items-start lg:text-left">
            <HeroTypewriterTitle
              id="landing-hero-title"
              line1={landingCopy.heroTitleLine1}
              line2={landingCopy.heroTitleLine2}
            />
            <p className="landing-hero-in landing-hero-in-delay-1 text-muted-foreground mt-4 text-sm leading-relaxed md:text-base">
              {landingCopy.heroLead}
            </p>

            <div
              className={cn(
                "landing-hero-in landing-hero-in-delay-2 mt-7 flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap lg:justify-start",
              )}
            >
              <Button className="min-w-44 px-8 shadow-sm" size="lg" render={<Link href="/app/analyze" />}>
                {landingCopy.heroCtaPrimary}
              </Button>
            </div>

            <div
              className={cn(
                "landing-hero-in landing-hero-in-delay-3 mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs lg:justify-start",
              )}
            >
              <span className="text-muted-foreground/90">{landingCopy.heroEyebrow}</span>
            </div>

            <div className="landing-hero-in landing-hero-in-delay-3 mt-8 w-full max-w-md lg:hidden">
              <LandingReportPreview />
            </div>
          </div>

          <div className="landing-hero-in landing-hero-in-delay-4 hidden lg:flex lg:h-fit lg:flex-col">
            <LandingReportPreview />
          </div>
        </div>
      </section>

      <LandingFeaturesSection />

      <LandingPricingSection />

      <section
        id="landing-faq"
        aria-labelledby="landing-faq-heading"
        className="scroll-mt-28 border-t border-border/35 py-16 md:py-20"
      >
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <LandingReveal>
            <header className="mx-auto max-w-3xl text-center">
              <h2 id="landing-faq-heading" className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
                {landingCopy.faqHeading}
              </h2>
            </header>
            <div className="mx-auto mt-10 max-w-3xl">
              <Accordion className="space-y-2">
                {landingCopy.faqItems.map((item) => (
                  <AccordionItem
                    key={item.q}
                    value={item.q}
                    className="border-border/45 bg-background/65 rounded-md border px-4 motion-safe:transition-colors motion-safe:duration-200 hover:bg-muted/30"
                  >
                    <AccordionTrigger className="py-4 text-left text-sm font-semibold leading-relaxed md:text-base">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <p className="text-muted-foreground text-sm leading-relaxed md:text-[15px]">{item.a}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </LandingReveal>
        </div>
      </section>
    </div>
  );
}
