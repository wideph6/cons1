import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireUser, run } from "@/lib/api";
import { cleanText, dbError, requireAppoWrite, withSignature } from "@/lib/appo";
import { headObject } from "@/lib/r2";
import { isAppoKey } from "@/lib/appo-r2";
import { db } from "@/lib/supabase";

interface Body {
  name?: string;
  designation?: string;
  /** An image already uploaded through /api/admin/appo/presign with kind "signatures". */
  signature_key?: string;
  signature_content_type?: string;
}

/**
 * POST /api/admin/appo/officers — saves a new approving officer: name, designation and signature
 * together, so a later upload picks all three at once.
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireAppoWrite(user);
    const body = await readBody<Body>(req);

    const name = cleanText(body.name, "Approving officer");
    const designation = cleanText(body.designation, "Approving officer designation");
    if (!name) throw new ApiError(400, "Enter the approving officer's name");

    const { data: same, error: sameErr } = await db()
      .from("appo_officers")
      .select("id")
      .ilike("name", name.replace(/[%_]/g, "\\$&"))
      .ilike("designation", designation.replace(/[%_]/g, "\\$&"))
      .limit(1);
    if (sameErr) throw dbError(sameErr);
    if (same?.length) {
      throw new ApiError(409, `${name}${designation ? ` (${designation})` : ""} is already saved. Pick them from the list.`);
    }

    let signature: { key: string; contentType: string } | null = null;
    if (body.signature_key) {
      if (!isAppoKey(body.signature_key, "signatures")) throw new ApiError(400, "Invalid signature storage key");
      const head = await headObject(body.signature_key);
      if (!head) throw new ApiError(400, "The signature image was not found in storage. Please upload it again.");
      signature = { key: body.signature_key, contentType: body.signature_content_type || head.contentType || "image/png" };
    }

    const { data, error } = await db()
      .from("appo_officers")
      .insert({
        name,
        designation,
        signature_r2_key: signature?.key ?? null,
        signature_content_type: signature?.contentType ?? null,
        created_by: user.id,
      })
      .select("id,name,designation,signature_r2_key,signature_content_type")
      .single();
    if (error) throw dbError(error);

    await logActivity({
      user_id: user.id,
      action: "create_appo_officer",
      details: { name, designation, signature: Boolean(signature) },
    });
    return ok({ item: await withSignature(data) }, { status: 201 });
  });
}
