import { ComplianceFooter } from "@/components/features/compliance-footer";
import { MarketingHeader } from "@/components/features/marketing-header";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="scroll-smooth flex min-h-full flex-col">
      <a
        href="#main-content"
        className="bg-background text-foreground border-border ring-ring/50 focus-visible:ring-ring/50 sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:inline-flex focus:h-auto focus:w-auto focus:min-h-0 focus:min-w-0 focus:translate-x-0 focus:translate-y-0 focus:overflow-visible focus:rounded-md focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2"
      >
        跳转至主要内容
      </a>
      <MarketingHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {children}
      </main>
      <ComplianceFooter />
    </div>
  );
}
