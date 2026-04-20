/** Placeholder for subscription and payment APIs (FR-012～014). */

import type { BillingCycle } from "@/lib/subscription-limits";

export type CheckoutPayload = {
  plan_id: "pro";
  billing_cycle: BillingCycle;
  agreed_terms: boolean;
};

export async function requestCheckout(payload: CheckoutPayload): Promise<{ status: "pending" }> {
  void payload;
  return { status: "pending" };
}
