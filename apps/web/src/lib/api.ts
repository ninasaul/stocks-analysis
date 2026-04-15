import { getPublicApiBaseUrl } from "@/lib/env";

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
