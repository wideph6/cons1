import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import {
  cancelCommissionRequest,
  commissionUser,
  decideCommissionRequest,
  getCommissionAccount,
  who,
} from "@/lib/commission";
import { canSeeOwnAccount } from "@/lib/finance";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/commission/requests/:id { action, note? }
 *   accept   the commission user it was sent to takes the payment: it comes off what they are owed
 *   reject   they turn it down (it never counted)
 *   cancel   the super admin takes it back while it still waits
 * Answers with the account of the user it was sent to.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    const { id } = await params;
    const body = await readBody<{ action?: string; note?: unknown }>(req);
    const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    const { data: req0 } = await db().from("commission_requests").select("user_id,amount").eq("id", id).maybeSingle();
    if (!req0) throw new ApiError(404, "Payment not found");
    const target = await commissionUser(String(req0.user_id));

    if (body.action === "cancel") {
      requireSuperadmin(me);
      await cancelCommissionRequest(id, note);
      after(() =>
        logActivity({
          user_id: me.id,
          action: "cancel_commission_payment",
          details: { request_id: id, target_user_id: target.id, target_email: target.email, amount: Number(req0.amount) },
        }),
      );
      return ok(await getCommissionAccount(who(target)));
    }

    if (body.action !== "accept" && body.action !== "reject") throw new ApiError(400, "action must be accept, reject or cancel");
    // Only the user it was sent to, while they may see their Finance tab.
    if (me.id !== target.id) throw new ApiError(403, "Only the user this payment was sent to can accept or turn it down.");
    if (!(await canSeeOwnAccount(me.id))) throw new ApiError(403, "Your Finance tab is not shown to you. Ask the super admin.");
    const accept = body.action === "accept";
    await decideCommissionRequest(id, me.id, accept, note);
    after(() =>
      logActivity({
        user_id: me.id,
        action: accept ? "accept_commission_payment" : "reject_commission_payment",
        details: { request_id: id, amount: Number(req0.amount), note },
      }),
    );
    return ok(await getCommissionAccount(who(target)));
  });
}
