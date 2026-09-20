import type { NextRequest } from "next/server";
import { ApiError, ok, requireUser, run } from "@/lib/api";
import { getRecord, requireApposttaRead } from "@/lib/appostta";
import { presignDownload } from "@/lib/r2";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/appostta/:id/preview?download=1 — short-lived URL for the record's document. */
export async function GET(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requireApposttaRead(user);
    const { id } = await params;
    const record = await getRecord(id);
    if (!record.doc_r2_key || !record.doc_filename) throw new ApiError(404, "This record has no document yet");

    const download = req.nextUrl.searchParams.get("download") === "1";
    const url = await presignDownload(
      record.doc_r2_key,
      record.doc_filename,
      download ? "attachment" : "inline",
      record.doc_content_type ?? "application/octet-stream",
      600,
    );
    return ok({ url, expires_in: 600, filename: record.doc_filename, content_type: record.doc_content_type });
  });
}
