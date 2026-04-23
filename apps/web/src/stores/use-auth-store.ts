"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  requestPasswordLogin,
  requestRegister,
  requestCurrentUser,
  requestRefreshToken,
  requestLogout,
  requestWechatLogin,
  type AuthApiUser,
  type RegisterPayload,
} from "@/lib/api/auth";

export type AuthUser = {
  phoneMasked: string;
  wechatBound: boolean;
  username?: string;
  email?: string;
};

type AuthState = {
  session: "guest" | "user";
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  syncSession: () => Promise<void>;
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  loginPassword: (identifier: string, password: string) => Promise<void>;
  loginWechatCode: (code: string) => Promise<void>;
  loginSmsMock: (phone: string, _code: string) => boolean;
  wechatScanMock: () => void;
  registerPassword: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
};

function maskPhone(phone?: string | null): string {
  if (!phone) {
    return "未绑定手机号";
  }
  if (!/^1\d{10}$/.test(phone)) {
    return phone;
  }
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function toAuthUser(user: AuthApiUser): AuthUser {
  return {
    phoneMasked: maskPhone(user.phone),
    wechatBound: false,
    username: user.username,
    email: user.email,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: "guest",
      user: null,
      accessToken: null,
      refreshToken: null,
      syncSession: async () => {
        const state = get();
        if (!state.accessToken) {
          return;
        }

        try {
          const user = await requestCurrentUser(state.accessToken);
          set({ session: "user", user: toAuthUser(user) });
          return;
        } catch {
          if (!state.refreshToken) {
            set({ session: "guest", user: null, accessToken: null, refreshToken: null });
            return;
          }
        }

        try {
          const refreshed = await requestRefreshToken({ refresh_token: state.refreshToken });
          const user = await requestCurrentUser(refreshed.access_token);
          set({
            session: "user",
            user: toAuthUser(user),
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
          });
        } catch {
          set({ session: "guest", user: null, accessToken: null, refreshToken: null });
        }
      },
      authenticatedFetch: async (input, init) => {
        const state = get();
        if (!state.accessToken) {
          throw new Error("当前未登录，请先登录后重试");
        }

        const requestWithAuth = (token: string) =>
          {
            const headers = new Headers(init?.headers);
            headers.set("Authorization", `Bearer ${token}`);
            return fetch(input, {
              ...init,
              headers,
            });
          };

        let response = await requestWithAuth(state.accessToken);
        if (response.status !== 401) {
          return response;
        }

        if (!state.refreshToken) {
          set({ session: "guest", user: null, accessToken: null, refreshToken: null });
          throw new Error("登录已过期，请重新登录");
        }

        const refreshed = await requestRefreshToken({ refresh_token: state.refreshToken });
        set({
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
        });

        response = await requestWithAuth(refreshed.access_token);
        if (response.status === 401) {
          set({ session: "guest", user: null, accessToken: null, refreshToken: null });
          throw new Error("登录已过期，请重新登录");
        }
        return response;
      },
      loginPassword: async (identifier, password) => {
        const result = await requestPasswordLogin({ identifier, password });
        set({
          session: "user",
          user: toAuthUser(result.user),
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
        });
      },
      loginWechatCode: async (code) => {
        const result = await requestWechatLogin(code);
        set({
          session: "user",
          user: toAuthUser(result.user),
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
        });
      },
      loginSmsMock: (phone) => {
        const ok = /^1\d{10}$/.test(phone);
        if (!ok) return false;
        set({
          session: "user",
          user: { phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-4)}`, wechatBound: false },
          accessToken: "mock-access-token",
          refreshToken: "mock-refresh-token",
        });
        return true;
      },
      wechatScanMock: () => {
        set({
          session: "user",
          user: { phoneMasked: "微信用户", wechatBound: true },
          accessToken: "mock-access-token",
          refreshToken: "mock-refresh-token",
        });
      },
      registerPassword: async (payload) => {
        const result = await requestRegister(payload, { grantTokens: true });
        if ("access_token" in result) {
          set({
            session: "user",
            user: toAuthUser(result.user),
            accessToken: result.access_token,
            refreshToken: result.refresh_token,
          });
          return;
        }
        const loginResult = await requestPasswordLogin({
          identifier: payload.username,
          password: payload.password,
        });
        set({
          session: "user",
          user: toAuthUser(loginResult.user),
          accessToken: loginResult.access_token,
          refreshToken: loginResult.refresh_token,
        });
      },
      logout: async () => {
        const state = get();
        try {
          if (state.accessToken && state.refreshToken) {
            await requestLogout(state.accessToken, state.refreshToken);
          }
        } finally {
          set({ session: "guest", user: null, accessToken: null, refreshToken: null });
        }
      },
    }),
    { name: "zhputian-auth" },
  ),
);
