import { clearSession, getAccessToken, getRefreshToken, getStoredUser, saveSession } from "./session";
import { promptNavigateToLogin } from "./guard";
import { normalizeNetworkError } from "./net-errors";

function getApiBase(): string {
  return getApp<IAppOption>().globalData.apiBase;
}

function parseDetail(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as { detail?: unknown };
  if (typeof d.detail === "string") return d.detail;
  if (Array.isArray(d.detail)) {
    return d.detail
      .map((x) =>
        typeof x === "object" && x !== null && "msg" in x ? String((x as { msg: string }).msg) : String(x)
      )
      .join("; ");
  }
  return "";
}

type RefreshTokenBody = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
};

function postRefresh(refreshToken: string): Promise<RefreshTokenBody> {
  const url = `${getApiBase()}/api/auth/refresh`;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: "POST",
      header: { "content-type": "application/json" },
      data: { refresh_token: refreshToken },
      timeout: 30000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          resolve(res.data as RefreshTokenBody);
          return;
        }
        reject(new Error(parseDetail(res.data) || "刷新登录失败"));
      },
      fail: (err) => reject(new Error(normalizeNetworkError(err.errMsg || ""))),
    });
  });
}

type HttpOptions = {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  data?: Record<string, unknown>;
  auth?: boolean;
};

type HttpOptionsInternal = HttpOptions & { _retried?: boolean };

function executeRequest<T>(options: HttpOptionsInternal): Promise<T> {
  const { path, method = "GET", data, auth = true, _retried = false } = options;
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const header: Record<string, string> = {
    "content-type": "application/json",
  };
  if (auth) {
    const t = getAccessToken();
    if (t) header.Authorization = `Bearer ${t}`;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data: method === "GET" ? undefined : data,
      header,
      timeout: 30000,
      success: (res) => {
        void (async () => {
          try {
            if (res.statusCode === 401 && auth) {
              const rt = getRefreshToken();
              const user = getStoredUser();
              if (!_retried && rt && user) {
                try {
                  const body = await postRefresh(rt);
                  saveSession({
                    access_token: body.access_token,
                    refresh_token: body.refresh_token,
                    user,
                  });
                  const again = await executeRequest<T>({ ...options, _retried: true });
                  resolve(again);
                  return;
                } catch {
                  // 刷新失败则走下方清理会话
                }
              }
              clearSession();
              promptNavigateToLogin({
                title: "登录已失效",
                content: "请重新登录后再试。",
              });
              reject(new Error("登录已失效"));
              return;
            }
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data as T);
              return;
            }
            const msg = parseDetail(res.data) || `请求失败（${res.statusCode}）`;
            reject(new Error(msg));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        })();
      },
      fail: (err) => reject(new Error(normalizeNetworkError(err.errMsg || ""))),
    });
  });
}

export function httpRequest<T>(options: HttpOptions): Promise<T> {
  return executeRequest<T>({ ...options, _retried: false });
}
