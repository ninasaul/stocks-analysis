import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/features/theme-switcher";

export function MarketingHeader() {
  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
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

        <nav className="flex items-center gap-1" aria-label="营销站点导航与操作">
          <Button variant="ghost" size="sm" className="hidden md:inline-flex" render={<Link href="/welcome" />}>
            产品介绍
          </Button>
          <Button variant="ghost" size="sm" className="hidden md:inline-flex" render={<Link href="/app/analyze" />}>
            工作台
          </Button>
          <ThemeSwitcher />
          <Button variant="ghost" size="sm" render={<Link href="/login" />}>
            登录
          </Button>
          <Button size="sm" variant="secondary" className="hidden sm:inline-flex" render={<Link href="/subscription" />}>
            订阅
          </Button>
        </nav>
      </div>
    </header>
  );
}
