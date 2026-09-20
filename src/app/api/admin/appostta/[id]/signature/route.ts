import type { NextRequest } from "next/server";
import { ok, requireUser, run } from "@/lib/api";
import { getRecord, getSettings, requireApposttaRead } from "@/lib/appostta";
import { getObjectBytes } from "@/lib/r2";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/appostta/:id/signature — the signature image as a data: URI.
 *
 * The certificate is exported by drawing its SVG onto a canvas. An <img> pointing at storage would
 * taint that canvas and make toDataURL throw, so the bytes have to travel inline.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requireApposttaRead(user);
    const { id } = await params;
    const record = await getRecord(id);

    let key = record.signature_r2_key;
    let source: "record" | "settings" | null = key ? "record" : null;
    if (!key) {
      const settings = await getSettings();
      key = settings.signature_r2_key;
      source = key ? "settings" : null;
    }
    if (!key) return ok({ data_uri: null, source: null });

    const obj = await getObjectBytes(key);
    if (!obj) return ok({ data_uri: null, source: null, missing: true });

    const base64 = Buffer.from(obj.bytes).toString("base64");
    return ok({ data_uri: `data:${obj.contentType};base64,${base64}`, source });
  });
}
