import { NextResponse } from "next/server";
import { GUEST_QUOTA, PLAN_DAILY_LIMITS } from "@/lib/subscription-limits";

/** 只读配额说明，供网关或前端与本地 store 对齐（FR-014 演进占位）。 */
export function GET() {
  return NextResponse.json({
    guest: GUEST_QUOTA,
    plans: {
      free: PLAN_DAILY_LIMITS.free,
      pro: PLAN_DAILY_LIMITS.pro,
    },
  });
}
