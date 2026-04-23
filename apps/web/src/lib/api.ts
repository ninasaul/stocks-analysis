import { getPublicApiBaseUrl } from "@/lib/env";

export { requestTimingReport } from "@/lib/api/timing";
export { requestPickerTurn } from "@/lib/api/picker";
export { requestPasswordLogin, requestRegister } from "@/lib/api/auth";
export { requestCheckout } from "@/lib/api/subscription";

function joinUrl(path: string): string {
  const base = getPublicApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(joinUrl(path));
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
