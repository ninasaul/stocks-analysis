import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

export function ComplianceFooter() {
  return (
    <footer className="border-t bg-muted/20">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="text-muted-foreground max-w-prose text-xs leading-relaxed">
          仅供研究参考，不构成投资建议。本产品不提供下单、委托或交易执行。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="link" size="sm" className="h-auto px-1 text-xs" render={<Link href="/privacy" />}>
            隐私政策
          </Button>
          <Separator orientation="vertical" className="hidden h-4 md:inline-flex" />
          <Button variant="link" size="sm" className="h-auto px-1 text-xs" render={<Link href="/terms" />}>
            服务条款
          </Button>
          <Separator orientation="vertical" className="hidden h-4 md:inline-flex" />
          <Button variant="link" size="sm" className="h-auto px-1 text-xs" render={<Link href="/welcome" />}>
            产品介绍
          </Button>
        </div>
      </div>
    </footer>
  );
}
