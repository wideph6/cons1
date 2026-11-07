import type { NextRequest } from "next/server";
import { ok, requireUser, run } from "@/lib/api";
import { requireOwnCase } from "@/lib/review";
import { getRecord, requireNewMAccess, signatureDataUri } from "@/lib/new-m";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/new-m/:id/signature — the signature this document carries, as a data: URI.
 * Read from the document's own copy, so it still shows after the officer is removed from the saved list.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requireNewMAccess(user);
    const { id } = await params;
    const record = await getRecord(id);
    requireOwnCase(user, record.created_by);
    return ok({ data_uri: await signatureDataUri(record.officer_signature_r2_key), officer_name: record.officer_name });
  });
}
