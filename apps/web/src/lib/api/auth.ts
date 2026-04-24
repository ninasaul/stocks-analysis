import { getPublicApiBaseUrl } from "@/lib/env";

export type AuthApiUser = {
  id: number;
  username: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type LoginPayload = {
  identifier: string;
  password: string;
};

export type LoginResult = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthApiUser;
};

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
  phone?: string;
};

export type RefreshTokenPayload = {
  refresh_token: string;
};

export type RefreshTokenResult = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type WechatQrCodeResult = {
  qr_url: string;
  state: string;
};

export type WechatLoginResult = LoginResult & {
  is_new_user: boolean;
};

type ApiErrorPayload = {
  message?: string;
  error?: string;
  detail?: string | Array<string | { msg?: string; type?: string }>;
};

function joinUrl(path: string): string {
  const base = getPublicApiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    const { detail, message, error } = payload;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const parts = detail.map((item) =>
        typeof item === "string" ? item : item?.msg ?? JSON.stringify(item),
      );
      return parts.filter(Boolean).join("；");
    }
  } catch {
    // Ignore JSON parse errors and fall back to HTTP status text.
  }
  return `请求失败（${response.status}）`;
}

export async function requestWechatQrCode(): Promise<WechatQrCodeResult> {
  const response = await fetch(joinUrl("/api/auth/wechat/qrcode"), { method: "GET" });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as WechatQrCodeResult;
}

export async function requestWechatLogin(code: string): Promise<WechatLoginResult> {
  const qs = new URLSearchParams({ code });
  const response = await fetch(joinUrl(`/api/auth/wechat/login?${qs.toString()}`), {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as WechatLoginResult;
}

export async function requestPasswordLogin(payload: LoginPayload): Promise<LoginResult> {
  const sendFormRequest = () => {
    const form = new URLSearchParams();
    form.set("username", payload.identifier);
    form.set("password", payload.password);
    return fetch(joinUrl("/api/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  };

  const sendJsonRequest = () =>
    fetch(joinUrl("/api/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: payload.identifier,
        password: payload.password,
      }),
    });

  let response = await sendFormRequest();
  if (response.status === 415 || response.status === 422) {
    response = await sendJsonRequest();
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as LoginResult;
}

export type RegisterOptions = {
  /** 为 true 时请求 `grant_tokens=true`，响应与登录相同，含 access_token / refresh_token */
  grantTokens?: boolean;
};

export async function requestRegister(
  payload: RegisterPayload,
  options?: RegisterOptions,
): Promise<AuthApiUser | LoginResult> {
  const qs = options?.grantTokens ? "?grant_tokens=true" : "";
  const response = await fetch(joinUrl(`/api/auth/register${qs}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const data = (await response.json()) as AuthApiUser | LoginResult;
  if ("access_token" in data && "refresh_token" in data) {
    return data as LoginResult;
  }
  return data as AuthApiUser;
}

export async function requestCurrentUser(accessToken: string): Promise<AuthApiUser> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };
  const response = await fetch(joinUrl("/api/users/me"), {
    method: "GET",
    headers,
  });

  if (response.ok) {
    return (await response.json()) as AuthApiUser;
  }

  if (response.status !== 404) {
    throw new Error(await parseApiError(response));
  }

  // Backward compatibility for older API deployments.
  const fallbackResponse = await fetch(joinUrl("/api/auth/me"), {
    method: "GET",
    headers,
  });
  if (!fallbackResponse.ok) {
    throw new Error(await parseApiError(fallbackResponse));
  }
  return (await fallbackResponse.json()) as AuthApiUser;
}

export async function requestRefreshToken(payload: RefreshTokenPayload): Promise<RefreshTokenResult> {
  const response = await fetch(joinUrl("/api/auth/refresh"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as RefreshTokenResult;
}

export async function requestLogout(accessToken: string, refreshToken: string): Promise<void> {
  const response = await fetch(joinUrl("/api/auth/logout"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}
