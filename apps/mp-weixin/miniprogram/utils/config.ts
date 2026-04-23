/** 覆盖默认后端地址：wx.setStorageSync('mp_api_base', 'https://your.api') 后重启小程序生效 */
export const MP_API_BASE_STORAGE_KEY = "mp_api_base";

/** 与 app 冷启动默认一致；无 storage 覆盖时使用 */
export const DEFAULT_API_BASE = "http://localhost:8011";

export function readApiBaseOverride(): string | null {
  try {
    const v = wx.getStorageSync(MP_API_BASE_STORAGE_KEY);
    if (typeof v !== "string") return null;
    const t = v.trim().replace(/\/$/, "");
    return /^https?:\/\/.+/i.test(t) ? t : null;
  } catch {
    return null;
  }
}

export function resolveApiBase(): string {
  return readApiBaseOverride() || DEFAULT_API_BASE;
}
