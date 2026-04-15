import { create } from "zustand";

type UiState = {
  tipsDismissed: boolean;
  dismissTips: () => void;
  resetTips: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  tipsDismissed: false,
  dismissTips: () => set({ tipsDismissed: true }),
  resetTips: () => set({ tipsDismissed: false }),
}));
