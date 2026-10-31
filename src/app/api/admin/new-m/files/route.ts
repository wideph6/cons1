import type { NextRequest } from "next/server";
import { ApiError, ok, requireUser, run } from "@/lib/api";
import { mapFile, NEW_M } from "@/lib/files";
import { db } from "@/lib/supabase";

/** GET /api/admin/new-m/files?link_id= — the files in one New M link. */
export async function GET(req: NextRequest) {
  return run(async () => {
    await requireUser();
    const linkId = req.nextUrl.searchParams.get("link_id");
    if (!linkId) throw new ApiError(400, "link_id is required");

    const { data, error } = await db()
      .from(NEW_M.files)
      .select(NEW_M.select)
      .eq("link_id", linkId)
      .order("filename")
      .range(0, 499);
    if (error) throw new ApiError(500, error.message);

    return ok({ items: (data ?? []).map((f) => mapFile(f as never)) });
  });
}
