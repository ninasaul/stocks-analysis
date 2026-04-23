import { clearSession, getRefreshToken, saveSession, type StoredUser } from "./session";
import { httpRequest } from "./http";
import { normalizeNetworkError } from "./net-errors";

type LoginResponseBody = {
  access_token: string;
  refresh_token: string;
  user: StoredUser;
};

type MiniProfile = {
  nickname?: string;
  avatarUrl?: string;
};

function getApiBase(): string {
  return getApp<IAppOption>().globalData.apiBase;
}

export function loginWithWxCode(code: string, profile?: MiniProfile): Promise<LoginResponseBody> {
  const base = getApiBase();
  const q = [`code=${encodeURIComponent(code)}`];
  if (profile?.nickname) q.push(`nickname=${encodeURIComponent(profile.nickname)}`);
  if (profile?.avatarUrl) q.push(`avatar_url=${encodeURIComponent(profile.avatarUrl)}`);
  const url = `${base}/api/auth/wechat/miniprogram/login?${q.join("&")}`;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: "POST",
      header: { "content-type": "application/json" },
      timeout: 30000,
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          const body = res.data as LoginResponseBody;
          saveSession(body);
          resolve(body);
          return;
        }
        const body = res.data as { detail?: string | unknown[] };
        let msg = `登录失败 (${res.statusCode})`;
        if (body && body.detail) {
          if (Array.isArray(body.detail)) {
            msg = body.detail
              .map((d) =>
                typeof d === "object" && d !== null && "msg" in d
                  ? String((d as { msg: string }).msg)
                  : String(d)
              )
              .join("; ");
          } else {
            msg = String(body.detail);
          }
        }
        reject(new Error(msg));
      },
      fail: (err) => reject(new Error(normalizeNetworkError(err.errMsg || ""))),
    });
  });
}

export async function fetchCurrentUser(): Promise<StoredUser> {
  return httpRequest<StoredUser>({ path: "/api/auth/me", method: "GET", auth: true });
}

/** 将 getPhoneNumber 返回的 code 提交后端换绑手机号（与 wx.login 的 code 不同） */
export async function bindMiniprogramPhoneCode(phoneCode: string): Promise<StoredUser> {
  return httpRequest<StoredUser>({
    path: "/api/auth/wechat/miniprogram/phone",
    method: "POST",
    data: { code: phoneCode },
    auth: true,
  });
}

export async function logoutRemote(): Promise<void> {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await httpRequest<unknown>({
        path: "/api/auth/logout",
        method: "POST",
        data: { refresh_token: refresh },
        auth: true,
      });
    } catch {
      // 仍清理本地态
    }
  }
  clearSession();
}
