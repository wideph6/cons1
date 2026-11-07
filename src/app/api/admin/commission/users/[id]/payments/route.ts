import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { commissionUser, getCommissionAccount, payCommission, who } from "@/lib/commission";
import { parseAmount } from "@/lib/finance-shared";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/commission/users/:id/payments { amount, note } — the super admin pays a commission user
 * (at most what is still owed). A user who sees their Finance tab gets it to accept, and nothing changes
 * until they do; for one who does not, it is taken off what they are owed straight away. Super admin only.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const u = await commissionUser((await params).id);
    const body = await readBody<{ amount?: unknown; note?: unknown }>(req);
    const amount = parseAmount(body.amount);
    if (amount === null) throw new ApiError(400, "Enter the amount paid (more than 0)");
    const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    const how = await payCommission(u.id, amount, note, me.id);
    after(() =>
      logActivity({
        user_id: me.id,
        action: how === "sent" ? "send_commission_payment" : "pay_commission",
        details: { target_user_id: u.id, target_email: u.email, amount, note },
      }),
    );
    return ok({ how, account: await getCommissionAccount(who(u)) }, { status: 201 });
  });
}
