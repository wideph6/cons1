import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import {
  MAX_FIELDS,
  getSettings,
  normalizePrefix,
  sanitizeFieldDefs,
  sanitizeSignatures,
  signatureKeyInUse,
} from "@/lib/appostta";
import { BORDER_STYLES } from "@/lib/certificate";
import { deleteObjects, getObjectBytes, headObject, isApposttaKey } from "@/lib/r2";
import { db } from "@/lib/supabase";
import type { ApposttaSignature } from "@/lib/types";

interface PatchBody {
  org_name?: string;
  org_tagline?: string;
  number_prefix?: string;
  /** The whole row list, replacing what is there. Rows keep their ids so records stay matched to them. */
  field_defs?: unknown;
  /** The whole signature list, replacing what is there. New entries carry a freshly uploaded key. */
  signatures?: unknown;
  default_signature_id?: string;
  footer_note?: string;
  watermark_text?: string;
  stamp_text?: string;
  stamp_after_row?: number;
  verify_note?: string;
  border_style?: string;
}

/**
 * GET /api/admin/appostta/settings — panel-wide defaults.
 *
 * Each signature image is inlined so the settings screen and the record form can show it without a
 * second round trip per signature, and so the certificate export is never blocked by a tainted canvas.
 */
export async function GET() {
  return run(async () => {
    await requireUser();
    const settings = await getSettings();

    const signature_data_uris: Record<string, string> = {};
    await Promise.all(
      settings.signatures.map(async (s) => {
        if (!s.r2_key) return;
        const obj = await getObjectBytes(s.r2_key);
        if (obj) signature_data_uris[s.id] = `data:${obj.contentType};base64,${Buffer.from(obj.bytes).toString("base64")}`;
      }),
    );

    return ok({ settings, signature_data_uris });
  });
}

/**
 * Confirms every signature image really is in storage before it is saved, so the record form never
 * offers a signature that would print as a blank space.
 */
async function verifySignatures(next: ApposttaSignature[]): Promise<ApposttaSignature[]> {
  return Promise.all(
    next.map(async (s) => {
      if (!s.r2_key) throw new ApiError(400, `Upload an image for the signature "${s.name}"`);
      if (!isApposttaKey(s.r2_key, "signatures")) throw new ApiError(400, "Invalid signature storage key");
      const head = await headObject(s.r2_key);
      if (!head) throw new ApiError(400, `The image for "${s.name}" was not found in storage. Please upload it again.`);
      return { ...s, content_type: head.contentType ?? s.content_type ?? "image/png" };
    }),
  );
}

/** PATCH /api/admin/appostta/settings */
export async function PATCH(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appostta_settings");
    const body = await readBody<PatchBody>(req);
    const existing = await getSettings();

    const patch: Record<string, unknown> = {};
    /** Images the settings stop pointing at, removed only after the row update succeeds. */
    let dropped: string[] = [];

    if (body.org_name !== undefined) patch.org_name = String(body.org_name).trim().slice(0, 160);
    if (body.org_tagline !== undefined) patch.org_tagline = String(body.org_tagline).trim().slice(0, 200);
    if (body.footer_note !== undefined) patch.footer_note = String(body.footer_note).trim().slice(0, 600);
    // Repeated across the whole background, so a long phrase is capped well below the other notes.
    if (body.watermark_text !== undefined) patch.watermark_text = String(body.watermark_text).trim().slice(0, 80);
    if (body.stamp_text !== undefined) patch.stamp_text = String(body.stamp_text).trim().slice(0, 120);
    // Clamped rather than rejected: a row list that changed under the form is not worth
    // failing a whole save over, and anything out of range simply means after the last row.
    if (body.stamp_after_row !== undefined) {
      const n = Math.trunc(Number(body.stamp_after_row));
      patch.stamp_after_row = Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_FIELDS) : 0;
    }
    if (body.verify_note !== undefined) patch.verify_note = String(body.verify_note).trim().slice(0, 300);
    if (body.border_style !== undefined) {
      const style = String(body.border_style);
      if (!BORDER_STYLES.includes(style as never)) throw new ApiError(400, "Unknown border style");
      patch.border_style = style;
    }
    if (body.number_prefix !== undefined) patch.number_prefix = normalizePrefix(body.number_prefix);

    // Replacing this list changes what later records start with. Records already created carry their
    // own frozen copy of the rows, so none of them is touched by this.
    if (body.field_defs !== undefined) patch.field_defs = sanitizeFieldDefs(body.field_defs);

    let signatures = existing.signatures;
    if (body.signatures !== undefined) {
      signatures = await verifySignatures(sanitizeSignatures(body.signatures));
      patch.signatures = signatures;

      const keptKeys = new Set(signatures.map((s) => s.r2_key));
      const candidates = existing.signatures.map((s) => s.r2_key).filter((k) => k && !keptKeys.has(k));
      // A record issued under a signature keeps its own copy of the key, so deleting the object here
      // would blank a certificate that was already handed out. Only unreferenced images go.
      const unused = await Promise.all(candidates.map(async (k) => (await signatureKeyInUse(k)) ? null : k));
      dropped = unused.filter((k): k is string => Boolean(k));
    }

    if (body.default_signature_id !== undefined) {
      const id = String(body.default_signature_id).trim();
      if (id && !signatures.some((s) => s.id === id)) throw new ApiError(400, "That signature is not in the list");
      patch.default_signature_id = id;
    } else if (patch.signatures && existing.default_signature_id) {
      // The default was just deleted, so point it at nothing rather than at a signature that is gone.
      if (!signatures.some((s) => s.id === existing.default_signature_id)) patch.default_signature_id = "";
    }

    if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");
    patch.updated_by = user.id;
    patch.updated_at = new Date().toISOString();

    const { error } = await db().from("appostta_settings").update(patch).eq("id", true);
    if (error) throw new ApiError(500, error.message);
    await deleteObjects(dropped);

    await logActivity({
      user_id: user.id,
      action: "update_appostta_settings",
      details: {
        changed: Object.keys(patch).filter((k) => k !== "updated_at" && k !== "updated_by"),
        rows: Array.isArray(patch.field_defs) ? patch.field_defs.length : undefined,
        signatures: patch.signatures ? signatures.length : undefined,
      },
    });
    return ok({ settings: await getSettings() });
  });
}
