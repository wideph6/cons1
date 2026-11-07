import { ApiError, ok, requireUser, run } from "@/lib/api";
import { canSeeOwnAccount, getAccount } from "@/lib/finance";

export const dynamic = "force-dynamic";

/** GET /api/admin/finance/me — the signed-in user's own account, when the super admin lets them see it. */
export async function GET() {
  return run(async () => {
    const me = await requireUser();
    // A commission user's account is what they are owed: /api/admin/commission/me.
    if (me.role === "commission") throw new ApiError(400, "Your account is a commission account.");
    if (me.role !== "superadmin" && !(await canSeeOwnAccount(me.id))) {
      throw new ApiError(403, "Your account is not shown to you. Ask the super admin.");
    }
    return ok(await getAccount({ id: me.id, name: me.name, email: me.email, role: me.role }));
  });
}
