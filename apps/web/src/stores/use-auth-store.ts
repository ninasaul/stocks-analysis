"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AuthUser = {
  phoneMasked: string;
  wechatBound: boolean;
};

type AuthState = {
  session: "guest" | "user";
  user: AuthUser | null;
  loginPasswordMock: (phone: string, _password: string) => boolean;
  loginSmsMock: (phone: string, _code: string) => boolean;
  wechatScanMock: () => void;
  registerPasswordMock: (phone: string, _password: string) => boolean;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: "guest",
      user: null,
      loginPasswordMock: (phone) => {
        const ok = /^1\d{10}$/.test(phone);
        if (!ok) return false;
        set({
          session: "user",
          user: { phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-4)}`, wechatBound: false },
        });
        return true;
      },
      loginSmsMock: (phone) => {
        const ok = /^1\d{10}$/.test(phone);
        if (!ok) return false;
        set({
          session: "user",
          user: { phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-4)}`, wechatBound: false },
        });
        return true;
      },
      wechatScanMock: () => {
        set({
          session: "user",
          user: { phoneMasked: "微信用户", wechatBound: true },
        });
      },
      registerPasswordMock: (phone) => {
        const ok = /^1\d{10}$/.test(phone);
        if (!ok) return false;
        set({
          session: "user",
          user: { phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-4)}`, wechatBound: false },
        });
        return true;
      },
      logout: () => set({ session: "guest", user: null }),
    }),
    { name: "zhputian-auth" },
  ),
);
