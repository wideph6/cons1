import type { NextRequest } from "next/server";
import { ApiError, intParam, ok, requirePermission, requireUser, run } from "@/lib/api";
import { db } from "@/lib/supabase";

/**
 * GET /api/admin/activity?user_id=&action=&domain_id=&from=&to=&q=&limit=&offset=
 * Super admin sees everything; other users only their own history.
 */
export async function GET(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const isSuper = user.role === "superadmin";
    if (!isSuper) requirePermission(user, "view_activity");

    const limit = intParam(sp.get("limit"), 50, 1, 200);
    const offset = intParam(sp.get("offset"), 0, 0, 1_000_000);

    let q = db()
      .from("activity_log")
      .select("*, users(name,email)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const userId = isSuper ? sp.get("user_id") : user.id;
    if (userId) q = q.eq("user_id", userId);
    const action = sp.get("action");
    if (action) q = q.eq("action", action);
    const domainId = sp.get("domain_id");
    if (domainId) q = q.eq("domain_id", domainId);
    const linkId = sp.get("link_id");
    if (linkId) q = q.eq("link_id", linkId);
    const from = sp.get("from");
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid 'from' date");
      q = q.gte("created_at", d.toISOString());
    }
    const to = sp.get("to");
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid 'to' date");
      q = q.lte("created_at", d.toISOString());
    }
    const text = (sp.get("q") ?? "").trim();
    if (text) {
      const pat = `%${text.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`filename.ilike.${pat},link_path.ilike.${pat},domain_hostname.ilike.${pat}`);
    }

    const { data, error, count } = await q;
    if (error) throw new ApiError(500, error.message);

    const items = (data ?? []).map((a) => {
      const { users, ...rest } = a as typeof a & { users?: { name: string; email: string } | null };
      return { ...rest, user: users ?? null };
    });
    return ok({ items, total: count ?? 0, limit, offset });
  });
}
