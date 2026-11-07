import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { USER_COLUMNS } from "@/lib/auth";
import { fileLinks } from "@/lib/file-history";
import { filenameTaken, finalizeUpload, getFileWithContext, placeFile } from "@/lib/files";
import { dropOldMPending, oldMPendingRow } from "@/lib/old-m-pending";
import { deleteObject, headObject } from "@/lib/r2";
import { db } from "@/lib/supabase";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/files/:id/pending — the change a commission user asked for on one of their live Old M files:
 * what it changes, and (when it replaces the file) the file as it is now and the one it would become, to
 * compare side by side. Super admin only.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    const [row, file] = await Promise.all([oldMPendingRow(id), getFileWithContext(id)]);
    if (!row) throw new ApiError(404, "No change is waiting for this file");
    const proposed =
      row.newKey && (await headObject(row.newKey))
        ? await fileLinks(row.newKey, row.newFilename ?? file.filename, row.newContentType ?? file.content_type, row.newSize)
        : null;
    const current = await fileLinks(file.r2_key, file.filename, file.content_type, file.size);
    return ok({ pending: row.info, label: file.filename, current, proposed });
  });
}

/**
 * POST /api/admin/files/:id/pending { decision: "approve" | "reject" } — the super admin approves the waiting
 * change (made now, as the user who asked for it: the new file, then the new name and link) or turns it down
 * (nothing changes; a file sent with it is deleted). An edit earns no commission.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    const { decision } = await readBody<{ decision?: string }>(req);
    if (decision !== "approve" && decision !== "reject") throw new ApiError(400, "decision must be approve or reject");
    const row = await oldMPendingRow(id);
    if (!row) throw new ApiError(404, "No change is waiting for this file. It may already have been decided.");
    let file = await getFileWithContext(id);

    if (decision === "reject") {
      await dropOldMPending(row.info.id);
      after(async () => {
        if (row.newKey && row.newKey !== file.r2_key) await deleteObject(row.newKey).catch(() => undefined);
        await logActivity({
          user_id: me.id,
          action: "reject_old_m_edit",
          domain: file.link?.domain ?? null,
          link: file.link ? { id: file.link.id, path: file.link.path } : null,
          file: { id: file.id, filename: file.filename },
          details: { requested_by: row.info.requested_by_name, changed: row.info.summary.map((c) => c.field) },
        });
      });
      return ok({ item: { ...file, pending_change: null } });
    }

    // Made as the user who asked for it, so the history shows who changed what; the approval is logged beside it.
    const requester = row.requestedBy
      ? ((await db().from("users").select(USER_COLUMNS).eq("id", row.requestedBy).maybeSingle()).data as User | null)
      : null;
    const as = requester ?? me;
    const name = row.newFilename ?? file.filename;
    const linkId = row.newLinkId ?? file.link_id;
    // The place it ends up in is checked first, so a clash stops the whole change before any of it is made.
    if ((row.newFilename || row.newLinkId) && (await filenameTaken(linkId, name, file.id))) {
      throw new ApiError(409, `A file named "${name}" already exists where this change would put it. Turn the change down, or rename that file first.`);
    }
    if (row.newKey) {
      file = await finalizeUpload({
        user: as,
        linkId: file.link_id,
        filename: file.filename,
        key: row.newKey,
        contentType: row.newContentType,
        fileId: file.id,
        approved: true,
      });
    }
    if (row.newFilename || row.newLinkId) {
      file = await placeFile(as, file, { filename: row.newFilename ?? undefined, linkId: row.newLinkId ?? undefined });
    }
    await dropOldMPending(row.info.id);
    after(() =>
      logActivity({
        user_id: me.id,
        action: "approve_old_m_edit",
        domain: file.link?.domain ?? null,
        link: file.link ? { id: file.link.id, path: file.link.path } : null,
        file: { id: file.id, filename: file.filename },
        details: { requested_by: row.info.requested_by_name, changed: row.info.summary.map((c) => c.field) },
      }),
    );
    return ok({ item: { ...file, pending_change: null } });
  });
}
