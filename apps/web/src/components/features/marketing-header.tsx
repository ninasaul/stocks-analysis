import Link from "next/link";
import Image from "next/image";
import { subscriptionTierPublicCopy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/features/theme-switcher";

export function MarketingHeader() {
  return (
    <header className="border-border/40 bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link
          href="/"
          className="focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-lg px-1 py-1 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2"
          aria-label="返回首页"
        >
          <Image
            src="/logo_light.svg"
            alt="智谱投研 Logo"
            width={28}
            height={28}
            className="block dark:hidden"
            priority
          />
          <Image
            src="/logo_dark.svg"
            alt="智谱投研 Logo"
            width={28}
            height={28}
            className="hidden dark:block"
            priority
          />
          <span className="text-sm font-semibold tracking-tight md:text-base">智谱投研</span>
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-0.5 sm:gap-1" aria-label="页面章节与操作">
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:inline-flex"
            render={<Link href="/#landing-features" scroll />}
          >
            功能
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:inline-flex"
            render={<Link href="/#landing-how" scroll />}
          >
            使用方式
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:inline-flex"
            render={<Link href="/#landing-pricing" scroll />}
          >
            {subscriptionTierPublicCopy.ctaViewPlansShort}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground lg:inline-flex"
            render={<Link href="/#landing-faq" scroll />}
          >
            常见问题
          </Button>
          <ThemeSwitcher />
          <Button variant="ghost" size="sm" render={<Link href="/login" />}>
            登录
          </Button>
          <Button size="sm" className="hidden sm:inline-flex" render={<Link href="/app/analyze" />}>
            进入工作台
          </Button>
        </nav>
      </div>
    </header>
  );
}
