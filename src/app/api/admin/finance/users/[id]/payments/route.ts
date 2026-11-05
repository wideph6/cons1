import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, must, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { USER_COLUMNS } from "@/lib/auth";
import { getAccount, recordPayment } from "@/lib/finance";
import { parseAmount } from "@/lib/finance-shared";
import { db } from "@/lib/supabase";
import type { User } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/finance/users/:id/payments { amount, note } — money the super admin received from the
 * user, taken off what they owe straight away. Super admin only.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const u = must(await db().from("users").select(USER_COLUMNS).eq("id", (await params).id).maybeSingle(), "User not found") as User;
    const body = await readBody<{ amount?: unknown; note?: unknown }>(req);
    const amount = parseAmount(body.amount);
    if (amount === null) throw new ApiError(400, "Enter the amount received (more than 0)");
    const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    await recordPayment(u.id, amount, note, me.id);
    after(() =>
      logActivity({ user_id: me.id, action: "record_finance_payment", details: { target_user_id: u.id, target_email: u.email, amount, note } }),
    );
    return ok(await getAccount({ id: u.id, name: u.name, email: u.email, role: u.role }), { status: 201 });
  });
}
