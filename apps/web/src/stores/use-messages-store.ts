"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "zhputian-app-messages";

export type AppMessage = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
};

function seedMessages(): AppMessage[] {
  const t = Date.now();
  return [
    {
      id: "msg-analysis-ready",
      title: "分析结果已生成",
      body: "你在自选中的标的已完成最新一轮预测，可在「历史与复盘」中查看存档。",
      createdAt: t - 1000 * 60 * 45,
      read: false,
    },
    {
      id: "msg-watchlist-sync",
      title: "自选列表同步完成",
      body: "云端自选与当前设备已对齐，重复项已自动合并。",
      createdAt: t - 1000 * 60 * 60 * 6,
      read: false,
    },
    {
      id: "msg-subscription",
      title: "订阅与用量",
      body: "当前套餐额度正常。如需升级，可在订阅页对比各档权益。",
      createdAt: t - 1000 * 60 * 60 * 24 * 2,
      read: true,
    },
    {
      id: "msg-security",
      title: "账号安全提示",
      body: "若你近期更换过设备，建议在设置中检查登录与会话状态。",
      createdAt: t - 1000 * 60 * 60 * 24 * 5,
      read: true,
    },
  ];
}

type MessagesState = {
  messages: AppMessage[];
  markRead: (id: string) => void;
  markAllRead: () => void;
};

export const useMessagesStore = create<MessagesState>()(
  persist(
    (set) => ({
      messages: seedMessages(),
      markRead: (id) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, read: true } : m)),
        })),
      markAllRead: () =>
        set((s) => ({
          messages: s.messages.map((m) => ({ ...m, read: true })),
        })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ messages: s.messages }),
    },
  ),
);

export function selectUnreadMessageCount(state: MessagesState): number {
  return state.messages.filter((m) => !m.read).length;
}
