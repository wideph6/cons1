import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { getSettings, normalizePrefix, sanitizeFields } from "@/lib/appostta";
import { deleteObject, getObjectBytes, headObject, isApposttaKey } from "@/lib/r2";
import { db } from "@/lib/supabase";

interface PatchBody {
  org_name?: string;
  org_tagline?: string;
  number_prefix?: string;
  default_fields?: unknown;
  signatory_name?: string;
  /** A new key replaces the shared signature; null removes it. */
  signature_key?: string | null;
  footer_note?: string;
}

/** GET /api/admin/appostta/settings — panel-wide defaults, with the signature inlined for preview. */
export async function GET() {
  return run(async () => {
    await requireUser();
    const settings = await getSettings();
    let signature_data_uri: string | null = null;
    if (settings.signature_r2_key) {
      const obj = await getObjectBytes(settings.signature_r2_key);
      if (obj) signature_data_uri = `data:${obj.contentType};base64,${Buffer.from(obj.bytes).toString("base64")}`;
    }
    return ok({ settings, signature_data_uri });
  });
}

/** PATCH /api/admin/appostta/settings */
export async function PATCH(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appostta_settings");
    const body = await readBody<PatchBody>(req);
    const existing = await getSettings();

    const patch: Record<string, unknown> = {};
    let stale: string | null = null;

    if (body.org_name !== undefined) patch.org_name = String(body.org_name).trim().slice(0, 160);
    if (body.org_tagline !== undefined) patch.org_tagline = String(body.org_tagline).trim().slice(0, 200);
    if (body.footer_note !== undefined) patch.footer_note = String(body.footer_note).trim().slice(0, 600);
    if (body.signatory_name !== undefined) patch.signatory_name = String(body.signatory_name).trim().slice(0, 160);
    if (body.number_prefix !== undefined) patch.number_prefix = normalizePrefix(body.number_prefix);
    if (body.default_fields !== undefined) patch.default_fields = sanitizeFields(body.default_fields);

    if (body.signature_key !== undefined) {
      if (body.signature_key === null) {
        stale = existing.signature_r2_key;
        patch.signature_r2_key = null;
        patch.signature_content_type = null;
      } else {
        if (!isApposttaKey(body.signature_key, "signatures")) throw new ApiError(400, "Invalid signature storage key");
        const head = await headObject(body.signature_key);
        if (!head) throw new ApiError(400, "The uploaded signature was not found in storage. Please upload again.");
        if (existing.signature_r2_key && existing.signature_r2_key !== body.signature_key) stale = existing.signature_r2_key;
        patch.signature_r2_key = body.signature_key;
        patch.signature_content_type = head.contentType ?? "image/png";
      }
    }

    if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");
    patch.updated_by = user.id;
    patch.updated_at = new Date().toISOString();

    const { error } = await db().from("appostta_settings").update(patch).eq("id", true);
    if (error) throw new ApiError(500, error.message);
    if (stale) await deleteObject(stale);

    await logActivity({
      user_id: user.id,
      action: "update_appostta_settings",
      details: { changed: Object.keys(patch).filter((k) => k !== "updated_at" && k !== "updated_by") },
    });
    return ok({ settings: await getSettings() });
  });
}
