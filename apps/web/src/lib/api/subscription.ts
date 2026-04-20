/** Placeholder for subscription and payment APIs (FR-012～014). */

export type CheckoutPayload = { plan_id: "pro"; agreed_terms: boolean };

export async function requestCheckout(payload: CheckoutPayload): Promise<{ status: "pending" }> {
  void payload;
  return { status: "pending" };
}
