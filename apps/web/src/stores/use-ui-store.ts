import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  tipsDismissed: boolean;
  dismissTips: () => void;
  resetTips: () => void;
  /** 应用壳顶部合规提示（FR-007 / 7.1） */
  complianceBannerDismissed: boolean;
  dismissComplianceBanner: () => void;
  resetComplianceBanner: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      tipsDismissed: false,
      dismissTips: () => set({ tipsDismissed: true }),
      resetTips: () => set({ tipsDismissed: false }),
      complianceBannerDismissed: false,
      dismissComplianceBanner: () => set({ complianceBannerDismissed: true }),
      resetComplianceBanner: () => set({ complianceBannerDismissed: false }),
    }),
    {
      name: "zhputian-ui",
      partialize: (state) => ({ complianceBannerDismissed: state.complianceBannerDismissed }),
    },
  ),
);
