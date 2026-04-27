/** Subscription and payment APIs (FR-012～014). */

import { getPublicApiBaseUrl } from "@/lib/env";
import type { BillingCycle } from "@/lib/subscription-limits";

export type CheckoutPayload = {
  plan_id: "pro";
  billing_cycle: BillingCycle;
  agreed_terms: boolean;
};

export type MembershipApiResult = {
  id: number;
  user_id: number;
  type: "normal" | "premium_monthly" | "premium_quarterly" | "premium_yearly";
  start_date: string;
  end_date: string | null;
  api_call_limit: number;
  api_call_used: number;
  api_call_remaining: number;
  status: "active" | "expired" | "cancelled";
  created_at: string;
  updated_at: string;
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

export async function requestCheckout(payload: CheckoutPayload): Promise<{ status: "pending" }> {
  void payload;
  return { status: "pending" };
}

export async function requestCurrentMembership(accessToken: string): Promise<MembershipApiResult> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };
  const candidates = ["/api/users/me/membership", "/users/me/membership"];
  let lastErrorResponse: Response | null = null;
  for (const path of candidates) {
    const response = await fetch(joinUrl(path), { method: "GET", headers });
    if (response.ok) {
      return (await response.json()) as MembershipApiResult;
    }
    lastErrorResponse = response;
    if (response.status !== 404) {
      break;
    }
  }
  throw new Error(await parseApiError(lastErrorResponse));
}
