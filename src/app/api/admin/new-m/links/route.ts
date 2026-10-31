import type { NextRequest } from "next/server";
import { ApiError, must, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { logStoreActivity, NEW_M } from "@/lib/files";
import { db } from "@/lib/supabase";
import { normalizePath } from "@/lib/utils";

/** POST /api/admin/new-m/links  { domain_id, path, notes? } */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_create_link");
    const body = await readBody<{ domain_id?: string; path?: string; notes?: string }>(req);
    if (!body.domain_id) throw new ApiError(400, "domain_id is required");
    const path = normalizePath(body.path);

    const domain = must(
      await db().from("domains").select("id,hostname").eq("id", body.domain_id).maybeSingle(),
      "Domain not found",
    ) as { id: string; hostname: string };

    const { data, error } = await db()
      .from(NEW_M.links)
      .insert({ domain_id: domain.id, path, notes: (body.notes ?? "").trim(), created_by: user.id })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `The link /${path} already exists on ${domain.hostname}`);
      throw new ApiError(500, error.message);
    }

    await logStoreActivity(NEW_M, {
      user_id: user.id,
      action: "create_link",
      domain,
      link: { id: data.id, path },
    });

    const { data: view } = await db().from(NEW_M.linksView).select("*").eq("id", data.id).single();
    return ok({ item: view ?? { ...data, file_count: 0, total_size: 0, last_upload_at: null } }, { status: 201 });
  });
}
