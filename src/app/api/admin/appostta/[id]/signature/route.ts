import type { NextRequest } from "next/server";
import { ok, requireUser, run } from "@/lib/api";
import { defaultSignature, getRecord, getSettings, requireApposttaRead } from "@/lib/appostta";
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

    // The record carries its own copy of the signature it was issued under. Only a record that was
    // never given one falls through to whichever signature settings currently default to.
    let key = record.signature_r2_key;
    let name = record.signatory_name;
    let source: "record" | "settings" | null = key ? "record" : null;
    if (!key) {
      const fallback = defaultSignature(await getSettings());
      key = fallback?.r2_key ?? null;
      name = fallback?.name ?? "";
      source = key ? "settings" : null;
    }
    if (!key) return ok({ data_uri: null, source: null, signatory_name: name });

    const obj = await getObjectBytes(key);
    if (!obj) return ok({ data_uri: null, source: null, missing: true, signatory_name: name });

    const base64 = Buffer.from(obj.bytes).toString("base64");
    return ok({ data_uri: `data:${obj.contentType};base64,${base64}`, source, signatory_name: name });
  });
}
