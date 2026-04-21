import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotificationPreferencesState = {
  /** 股票预测内：报告生成成功、从选股交接至预测等提示 */
  notifyTaskComplete: boolean;
  /** 导出报告、复制内容等成功反馈 */
  notifyWorkspaceActions: boolean;
};

type Actions = {
  setNotifyTaskComplete: (value: boolean) => void;
  setNotifyWorkspaceActions: (value: boolean) => void;
  resetNotificationPreferences: () => void;
};

const defaults: NotificationPreferencesState = {
  notifyTaskComplete: true,
  notifyWorkspaceActions: true,
};

export const useNotificationPreferencesStore = create<NotificationPreferencesState & Actions>()(
  persist(
    (set) => ({
      ...defaults,
      setNotifyTaskComplete: (notifyTaskComplete) => set({ notifyTaskComplete }),
      setNotifyWorkspaceActions: (notifyWorkspaceActions) => set({ notifyWorkspaceActions }),
      resetNotificationPreferences: () => set({ ...defaults }),
    }),
    {
      name: "zhputian-notification-preferences",
      version: 1,
      partialize: (state) => ({
        notifyTaskComplete: state.notifyTaskComplete,
        notifyWorkspaceActions: state.notifyWorkspaceActions,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<NotificationPreferencesState> | null;
        if (!p || typeof p !== "object") return current;
        return {
          ...current,
          notifyTaskComplete:
            typeof p.notifyTaskComplete === "boolean" ? p.notifyTaskComplete : current.notifyTaskComplete,
          notifyWorkspaceActions:
            typeof p.notifyWorkspaceActions === "boolean"
              ? p.notifyWorkspaceActions
              : current.notifyWorkspaceActions,
        };
      },
    },
  ),
);
