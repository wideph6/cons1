import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { filenameTaken, getFileWithContext, getLinkWithDomain } from "@/lib/files";
import { db } from "@/lib/supabase";
import type { MoveResult } from "@/lib/types";

/**
 * POST /api/admin/files/move  { file_ids: string[], link_id: string }
 * Moves files to another link. The stored object stays where it is — only the link that owns the
 * row changes — so each file gets a new public address and the old one stops working.
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "move");
    const body = await readBody<{ file_ids?: string[]; link_id?: string }>(req);

    const ids = Array.isArray(body.file_ids) ? body.file_ids.filter((id) => typeof id === "string" && id) : [];
    if (!ids.length) throw new ApiError(400, "Select at least one file to move");
    if (ids.length > 500) throw new ApiError(400, "Move at most 500 files at a time");
    if (!body.link_id) throw new ApiError(400, "link_id is required");

    const target = await getLinkWithDomain(body.link_id);
    const skipped: MoveResult["skipped"] = [];
    let moved = 0;

    for (const id of ids) {
      const file = await getFileWithContext(id);
      if (file.link_id === target.id) {
        skipped.push({ filename: file.filename, reason: "Already in that link" });
        continue;
      }
      if (await filenameTaken(target.id, file.filename)) {
        skipped.push({ filename: file.filename, reason: "A file with this name is already there" });
        continue;
      }

      const from = file.link;
      const { error } = await db()
        .from("files")
        .update({ link_id: target.id, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        if (error.code === "23505") {
          skipped.push({ filename: file.filename, reason: "A file with this name is already there" });
          continue;
        }
        throw new ApiError(500, error.message);
      }
      moved++;

      await logActivity({
        user_id: user.id,
        action: "move",
        domain: target.domain,
        link: { id: target.id, path: target.path },
        file: { id, filename: file.filename },
        details: {
          from_hostname: from?.domain.hostname ?? null,
          from_path: from?.path ?? null,
          to_hostname: target.domain.hostname,
          to_path: target.path,
        },
      });
    }

    return ok({ moved, skipped } satisfies MoveResult);
  });
}
