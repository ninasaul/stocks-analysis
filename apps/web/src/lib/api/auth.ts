/** Placeholder for authentication API. Local store validates format today. */

export type PasswordLoginPayload = { phone: string; password: string };
export type SmsLoginPayload = { phone: string; code: string };

export async function requestPasswordLogin(payload: PasswordLoginPayload): Promise<{ ok: boolean }> {
  void payload;
  return { ok: true };
}

export async function requestSmsLogin(payload: SmsLoginPayload): Promise<{ ok: boolean }> {
  void payload;
  return { ok: true };
}
