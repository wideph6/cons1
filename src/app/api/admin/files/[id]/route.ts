import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { filenameTaken, getFileWithContext } from "@/lib/files";
import { deleteObject } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { cleanFilename, guessContentType } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/files/:id */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    await requireUser();
    const { id } = await params;
    return ok({ item: await getFileWithContext(id) });
  });
}

/** PATCH /api/admin/files/:id  { filename } — rename (storage key stays the same). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "rename");
    const { id } = await params;
    const body = await readBody<{ filename?: string }>(req);
    const file = await getFileWithContext(id);
    const next = cleanFilename(body.filename);
    if (next === file.filename) return ok({ item: file });

    if (await filenameTaken(file.link_id, next, id)) {
      throw new ApiError(409, `A file named "${next}" already exists in this link`);
    }

    const now = new Date().toISOString();
    const { error } = await db()
      .from("files")
      .update({ filename: next, content_type: guessContentType(next, file.content_type), renamed_at: now, updated_at: now })
      .eq("id", id);
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `A file named "${next}" already exists in this link`);
      throw new ApiError(500, error.message);
    }

    await logActivity({
      user_id: user.id,
      action: "rename",
      domain: file.link?.domain ?? null,
      link: file.link ? { id: file.link.id, path: file.link.path } : null,
      file: { id, filename: next },
      details: { from: file.filename, to: next },
    });
    return ok({ item: await getFileWithContext(id) });
  });
}

/** DELETE /api/admin/files/:id */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "delete");
    const { id } = await params;
    const file = await getFileWithContext(id);

    const { error } = await db().from("files").delete().eq("id", id);
    if (error) throw new ApiError(500, error.message);
    await deleteObject(file.r2_key);

    await logActivity({
      user_id: user.id,
      action: "delete",
      domain: file.link?.domain ?? null,
      link: file.link ? { id: file.link.id, path: file.link.path } : null,
      file: { id: null, filename: file.filename },
      details: { size: file.size, uploaded_at: file.uploaded_at, downloads: file.download_count },
    });
    return ok({ ok: true });
  });
}
