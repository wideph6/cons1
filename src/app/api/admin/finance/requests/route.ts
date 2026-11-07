import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireUser, run } from "@/lib/api";
import { canSeeOwnAccount, createRequest, listRequests } from "@/lib/finance";
import { parseAmount } from "@/lib/finance-shared";

/**
 * POST /api/admin/finance/requests { amount, note } — a user who paid the super admin in cash says so. It
 * changes nothing until the super admin accepts it. Only users allowed to see their own account may send one.
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const me = await requireUser();
    if (me.role === "superadmin") throw new ApiError(400, "The super admin records payments on the user's account instead.");
    // A commission user is paid by the super admin, not the other way round.
    if (me.role === "commission") throw new ApiError(400, "Payments to you are sent by the super admin; accept them in your Finance tab.");
    if (!(await canSeeOwnAccount(me.id))) throw new ApiError(403, "Payment requests are not open to you. Ask the super admin.");
    const body = await readBody<{ amount?: unknown; note?: unknown }>(req);
    const amount = parseAmount(body.amount);
    if (amount === null) throw new ApiError(400, "Enter the amount you paid (more than 0)");
    const waiting = await listRequests({ userId: me.id, pendingOnly: true, limit: 50 });
    if (waiting.length >= 10) throw new ApiError(429, "You already have 10 requests waiting. Wait for the super admin to decide them.");
    const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    const item = await createRequest(me.id, amount, note);
    after(() => logActivity({ user_id: me.id, action: "create_finance_request", details: { amount, note } }));
    return ok({ item }, { status: 201 });
  });
}
