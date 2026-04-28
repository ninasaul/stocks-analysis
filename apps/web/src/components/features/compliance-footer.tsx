import Image from "next/image";
import { marketingFooterCopy } from "@/lib/copy";

export function ComplianceFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border/35 border-t bg-background">
      <div className="mx-auto max-w-6xl px-4 pt-12 pb-10 md:px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 w-full max-w-md space-y-3 lg:max-w-2xl lg:flex-1">
            <a
              href="/"
              className="focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-2"
              aria-label="返回首页"
            >
              <Image
                src="/logo_light.svg"
                alt="智谱投研 Logo"
                width={28}
                height={28}
                className="block dark:hidden"
              />
              <Image
                src="/logo_dark.svg"
                alt="智谱投研 Logo"
                width={28}
                height={28}
                className="hidden dark:block"
              />
              <span className="text-foreground text-sm font-semibold tracking-tight">智谱投研</span>
            </a>
            <p className="text-muted-foreground text-sm leading-relaxed">{marketingFooterCopy.brandTagline}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">{marketingFooterCopy.brandDisclaimer}</p>
          </div>

          <nav
            className="flex shrink-0 flex-wrap items-start gap-x-4 gap-y-5 sm:gap-x-5 lg:gap-x-6"
            aria-label="页脚导航"
          >
            {marketingFooterCopy.columns.map((column) => (
              <div key={column.title} className="min-w-28 sm:min-w-32 lg:min-w-36">
                <p className="text-foreground text-xs font-semibold tracking-wide">{column.title}</p>
                <ul className="mt-2 space-y-1.5">
                  {column.links.map((item) => (
                    <li key={`${column.title}-${item.href}-${item.label}`}>
                      <a
                        href={item.href}
                        className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-border/30 mt-10 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            © {year} 智谱投研。保留所有权利。
          </p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs" aria-label="法律链接">
            <a href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
              服务条款
            </a>
            <a href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
              隐私政策
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
