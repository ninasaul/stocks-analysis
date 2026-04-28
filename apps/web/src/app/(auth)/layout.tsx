import Image from "next/image";
import { FallingPattern } from "@/components/features/falling-pattern";
import { ThemeSwitcher } from "@/components/features/theme-switcher";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 min-h-full" aria-hidden>
        <FallingPattern className="h-full min-h-full p-0" blurIntensity="0.9em" duration={160} />
      </div>
      <a
        href="#auth-main-content"
        className="bg-background text-foreground border-border ring-ring/50 focus-visible:ring-ring/50 sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:inline-flex focus:h-auto focus:w-auto focus:min-h-0 focus:min-w-0 focus:translate-x-0 focus:translate-y-0 focus:overflow-visible focus:rounded-md focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2"
      >
        跳转至主要内容
      </a>
      <header className="sticky top-0 z-30">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 md:px-6">
          <a
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
          </a>
          <ThemeSwitcher />
        </div>
      </header>
      <main
        id="auth-main-content"
        tabIndex={-1}
        className="relative z-10 flex-1 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-1 h-28 bg-linear-to-t from-background to-transparent md:h-36"
          aria-hidden
        />
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}
