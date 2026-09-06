import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, must, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { getLinkWithDomain, listLinkKeys } from "@/lib/files";
import { deleteObjects } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { normalizePath } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/links/:id  { path?, notes? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "edit_link");
    const { id } = await params;
    const body = await readBody<{ path?: string; notes?: string }>(req);
    const link = await getLinkWithDomain(id);

    const patch: Record<string, unknown> = {};
    if (body.path !== undefined) patch.path = normalizePath(body.path);
    if (body.notes !== undefined) patch.notes = String(body.notes).trim();
    if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");

    const { error } = await db().from("links").update(patch).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `The link /${patch.path} already exists on ${link.domain.hostname}`);
      throw new ApiError(500, error.message);
    }

    await logActivity({
      user_id: user.id,
      action: "update_link",
      domain: link.domain,
      link: { id, path: (patch.path as string | undefined) ?? link.path },
      details: { previous_path: link.path, changes: patch },
    });

    const view = must(await db().from("links_view").select("*").eq("id", id).maybeSingle(), "Link not found");
    return ok({ item: view });
  });
}

/** DELETE /api/admin/links/:id — deletes all files in the link from storage, then the link. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "delete_link");
    const { id } = await params;
    const link = await getLinkWithDomain(id);

    const keys = await listLinkKeys([id]);
    await deleteObjects(keys);

    const { error } = await db().from("links").delete().eq("id", id);
    if (error) throw new ApiError(500, error.message);

    await logActivity({
      user_id: user.id,
      action: "delete_link",
      domain: link.domain,
      link: { id: null, path: link.path },
      details: { files: keys.length },
    });
    return ok({ ok: true, files_deleted: keys.length });
  });
}
