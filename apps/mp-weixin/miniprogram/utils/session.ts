const KEY_ACCESS = "access_token";
const KEY_REFRESH = "refresh_token";
const KEY_USER = "user";

export type StoredUser = {
  id?: number;
  username?: string;
  email?: string;
  phone?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

export function hasSession(): boolean {
  return Boolean(wx.getStorageSync(KEY_ACCESS));
}

export function getAccessToken(): string {
  return (wx.getStorageSync(KEY_ACCESS) as string) || "";
}

export function getRefreshToken(): string {
  return (wx.getStorageSync(KEY_REFRESH) as string) || "";
}

export function getStoredUser(): StoredUser | null {
  const u = wx.getStorageSync(KEY_USER);
  if (!u || typeof u !== "object") return null;
  return u as StoredUser;
}

export function clearSession(): void {
  wx.removeStorageSync(KEY_ACCESS);
  wx.removeStorageSync(KEY_REFRESH);
  wx.removeStorageSync(KEY_USER);
}

export function saveSession(payload: {
  access_token: string;
  refresh_token: string;
  user: StoredUser;
}): void {
  wx.setStorageSync(KEY_ACCESS, payload.access_token);
  wx.setStorageSync(KEY_REFRESH, payload.refresh_token);
  wx.setStorageSync(KEY_USER, payload.user);
}
