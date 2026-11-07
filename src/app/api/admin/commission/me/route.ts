import { ApiError, ok, requireUser, run } from "@/lib/api";
import { getCommissionAccount, who } from "@/lib/commission";
import { canSeeOwnAccount } from "@/lib/finance";

export const dynamic = "force-dynamic";

/** GET /api/admin/commission/me — a commission user's own account, when the super admin lets them see it. */
export async function GET() {
  return run(async () => {
    const me = await requireUser();
    if (me.role !== "commission") throw new ApiError(400, "Only commission users have a commission account.");
    if (!(await canSeeOwnAccount(me.id))) throw new ApiError(403, "Your Finance tab is not shown to you. Ask the super admin.");
    return ok(await getCommissionAccount(who(me)));
  });
}
