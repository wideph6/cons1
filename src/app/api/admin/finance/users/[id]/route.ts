import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { must, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { USER_COLUMNS } from "@/lib/auth";
import { getAccount, setVisible } from "@/lib/finance";
import { db } from "@/lib/supabase";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function target(id: string): Promise<User> {
  return must(await db().from("users").select(USER_COLUMNS).eq("id", id).maybeSingle(), "User not found") as User;
}

/** GET /api/admin/finance/users/:id — one user's account. Super admin only. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const u = await target((await params).id);
    return ok(await getAccount({ id: u.id, name: u.name, email: u.email, role: u.role }));
  });
}

/** PATCH /api/admin/finance/users/:id { visible } — whether the user sees their own account. Super admin only. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const u = await target((await params).id);
    const body = await readBody<{ visible?: unknown }>(req);
    const visible = body.visible === true;
    await setVisible(u.id, visible, me.id);
    after(() =>
      logActivity({ user_id: me.id, action: "update_finance_access", details: { target_user_id: u.id, target_email: u.email, visible } }),
    );
    return ok(await getAccount({ id: u.id, name: u.name, email: u.email, role: u.role }));
  });
}
