/**
 * Browser-callable API origin. Set in `.env.local` as `NEXT_PUBLIC_API_BASE_URL`.
 */
export function getPublicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw?.trim()) {
    return "http://localhost:8011";
  }
  return raw.replace(/\/$/, "");
}

/**
 * Mock walkthrough mode for local verification.
 * - default: enabled in non-production
 * - override: NEXT_PUBLIC_USE_MOCK_FLOW=true/false
 */
export function isMockFlowEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_USE_MOCK_FLOW;
  if (!raw?.trim()) {
    return process.env.NODE_ENV !== "production";
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
