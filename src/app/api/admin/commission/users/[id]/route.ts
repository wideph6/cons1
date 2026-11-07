import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { commissionUser, getCommissionAccount, getCommissionRates, setCommissionRates, who } from "@/lib/commission";
import { cleanRates } from "@/lib/finance";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/commission/users/:id — a commission user's account. Super admin only. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    return ok(await getCommissionAccount(who(await commissionUser((await params).id))));
  });
}

/**
 * PATCH /api/admin/commission/users/:id { rates: { old_m, new_m, appo } } — what each approved new case earns
 * this user from now on; commission already earned keeps its amount. Super admin only.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const u = await commissionUser((await params).id);
    const body = await readBody<{ rates?: unknown }>(req);
    const rates = cleanRates(body.rates);
    const before = (await getCommissionRates([u.id])).get(u.id) ?? null;
    await setCommissionRates(u.id, rates, me.id);
    after(() =>
      logActivity({
        user_id: me.id,
        action: "update_commission_rates",
        details: { target_user_id: u.id, target_email: u.email, from: before, to: rates },
      }),
    );
    return ok(await getCommissionAccount(who(u)));
  });
}
