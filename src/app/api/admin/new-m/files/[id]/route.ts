import type { NextRequest } from "next/server";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { filenameTaken, getFileWithContext, logStoreActivity, NEW_M } from "@/lib/files";
import { deleteObject } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { cleanFilename, guessContentType } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/new-m/files/:id */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    await requireUser();
    const { id } = await params;
    return ok({ item: await getFileWithContext(id, NEW_M) });
  });
}

/** PATCH /api/admin/new-m/files/:id  { filename } — rename (storage key stays the same). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_rename");
    const { id } = await params;
    const body = await readBody<{ filename?: string }>(req);
    const file = await getFileWithContext(id, NEW_M);
    const next = cleanFilename(body.filename);
    if (next === file.filename) return ok({ item: file });

    if (await filenameTaken(file.link_id, next, id, NEW_M)) {
      throw new ApiError(409, `A file named "${next}" already exists in this link`);
    }

    const now = new Date().toISOString();
    const { error } = await db()
      .from(NEW_M.files)
      .update({ filename: next, content_type: guessContentType(next, file.content_type), renamed_at: now, updated_at: now })
      .eq("id", id);
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `A file named "${next}" already exists in this link`);
      throw new ApiError(500, error.message);
    }

    await logStoreActivity(NEW_M, {
      user_id: user.id,
      action: "rename",
      domain: file.link?.domain ?? null,
      link: file.link ? { id: file.link.id, path: file.link.path } : null,
      file: { id, filename: next },
      details: { from: file.filename, to: next },
    });
    return ok({ item: await getFileWithContext(id, NEW_M) });
  });
}

/** DELETE /api/admin/new-m/files/:id */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_delete");
    const { id } = await params;
    const file = await getFileWithContext(id, NEW_M);

    const { error } = await db().from(NEW_M.files).delete().eq("id", id);
    if (error) throw new ApiError(500, error.message);
    await deleteObject(file.r2_key);

    await logStoreActivity(NEW_M, {
      user_id: user.id,
      action: "delete",
      domain: file.link?.domain ?? null,
      link: file.link ? { id: file.link.id, path: file.link.path } : null,
      file: { id: null, filename: file.filename },
      details: { size: file.size, uploaded_at: file.uploaded_at },
    });
    return ok({ ok: true });
  });
}
