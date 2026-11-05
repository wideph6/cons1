import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { decideRequest } from "@/lib/finance";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/finance/requests/:id { accept: boolean, note? } — the super admin accepts a payment
 * request (its amount comes off what the user owes) or turns it down. A request is decided only once.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    const body = await readBody<{ accept?: unknown; note?: unknown }>(req);
    const accept = body.accept === true;
    const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    const item = await decideRequest(id, accept, note, me.id);
    after(() =>
      logActivity({
        user_id: me.id,
        action: accept ? "accept_finance_request" : "reject_finance_request",
        details: { request_id: id, target_user_id: item.user_id, target_email: item.user_email, amount: item.amount },
      }),
    );
    return ok({ item });
  });
}
