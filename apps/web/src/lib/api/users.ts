import { getPublicApiBaseUrl } from "@/lib/env";
import type { MembershipApiResult } from "@/lib/api/subscription";

export type UserApiResult = {
  id: number;
  username: string;
  email: string;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type UserUpdatePayload = {
  email?: string;
  phone?: string;
  display_name?: string;
  avatar_url?: string;
};

export type ApiCallLogApiResult = {
  id: number;
  user_id: number;
  endpoint: string;
  method: string;
  call_time: string;
  response_status: number | null;
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

async function parseApiError(response: Response | null): Promise<string> {
  if (!response) {
    return "请求失败（未收到服务响应）";
  }
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    const { detail, message, error } = payload;
    if (typeof message === "string" && message.trim().length > 0) return message;
    if (typeof error === "string" && error.trim().length > 0) return error;
    if (typeof detail === "string" && detail.trim().length > 0) return detail;
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

function authHeaders(accessToken: string, contentType?: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

export async function requestCurrentUserProfile(accessToken: string): Promise<UserApiResult> {
  const response = await fetch(joinUrl("/api/users/me"), {
    method: "GET",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return (await response.json()) as UserApiResult;
}

export async function requestUpdateCurrentUserProfile(
  accessToken: string,
  payload: UserUpdatePayload,
): Promise<UserApiResult> {
  const response = await fetch(joinUrl("/api/users/me"), {
    method: "PUT",
    headers: authHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return (await response.json()) as UserApiResult;
}

export async function requestCurrentMembership(accessToken: string): Promise<MembershipApiResult> {
  const response = await fetch(joinUrl("/api/users/me/membership"), {
    method: "GET",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return (await response.json()) as MembershipApiResult;
}

export async function requestCurrentUserApiCalls(
  accessToken: string,
  params?: { limit?: number; offset?: number },
): Promise<ApiCallLogApiResult[]> {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (typeof params?.offset === "number") query.set("offset", String(params.offset));
  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";

  const response = await fetch(joinUrl(`/api/users/me/api-calls${suffix}`), {
    method: "GET",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return (await response.json()) as ApiCallLogApiResult[];
}
