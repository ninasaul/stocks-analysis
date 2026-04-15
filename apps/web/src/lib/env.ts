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
