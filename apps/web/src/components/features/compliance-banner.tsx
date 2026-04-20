"use client";

import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useUiStore } from "@/stores/use-ui-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ComplianceBanner() {
  const dismissed = useUiStore((s) => s.complianceBannerDismissed);
  const dismiss = useUiStore((s) => s.dismissComplianceBanner);
  const hydrated = useStoreHydrated(useUiStore);

  if (!hydrated || dismissed) return null;

  return (
    <AlertDialog open onOpenChange={(nextOpen) => (!nextOpen ? dismiss() : undefined)}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="leading-snug">仅供研究参考</AlertDialogTitle>
          <AlertDialogDescription>
            不构成投资建议；本产品不提供下单、委托或交易执行。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismiss}>知道了</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
