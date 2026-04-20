import { ComplianceFooter } from "@/components/features/compliance-footer";
import { MarketingHeader } from "@/components/features/marketing-header";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <MarketingHeader />
      <div className="flex-1">{children}</div>
      <ComplianceFooter />
    </div>
  );
}
