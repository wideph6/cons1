import type { NextRequest } from "next/server";
import { ok, requirePermission, requireUser, run } from "@/lib/api";
import { getFileWithContext } from "@/lib/files";
import { presignDownload } from "@/lib/r2";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/files/:id/preview?download=1 — short-lived URL to view (inline) or download the file. */
export async function GET(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "preview");
    const { id } = await params;
    const file = await getFileWithContext(id);
    const download = req.nextUrl.searchParams.get("download") === "1";
    const url = await presignDownload(file.r2_key, file.filename, download ? "attachment" : "inline", file.content_type, 600);
    return ok({ url, expires_in: 600, filename: file.filename, content_type: file.content_type });
  });
}
