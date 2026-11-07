import type { NextRequest } from "next/server";
import { ok, requireUser, run } from "@/lib/api";
import { requireOwnCase } from "@/lib/review";
import { getRecord, requireAppoAccess } from "@/lib/appo";
import { presignDownload } from "@/lib/r2";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/appo/:id/preview?download=1 — short-lived URL for the document's PDF. */
export async function GET(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requireAppoAccess(user);
    const { id } = await params;
    const record = await getRecord(id);
    requireOwnCase(user, record.created_by);

    const download = req.nextUrl.searchParams.get("download") === "1";
    const url = await presignDownload(
      record.doc_r2_key,
      record.doc_filename,
      download ? "attachment" : "inline",
      record.doc_content_type,
      600,
    );
    return ok({ url, expires_in: 600, filename: record.doc_filename, content_type: record.doc_content_type });
  });
}
