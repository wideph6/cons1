import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, requirePermission, requireUser, run } from "@/lib/api";
import { dbError, releaseSignature } from "@/lib/new-m";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/new-m/officers/:id — drops an officer from the saved list. Documents given this
 * officer keep their own copy of the name, designation and signature.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_settings");
    const { id } = await params;

    const { data, error } = await db()
      .from("new_m_officers")
      .delete()
      .eq("id", id)
      .select("id,name,designation,signature_r2_key")
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new ApiError(404, "That officer is no longer in the saved list");

    // Kept while any document still shows it.
    await releaseSignature(data.signature_r2_key as string | null);

    await logActivity({
      user_id: user.id,
      action: "delete_new_m_officer",
      details: { name: data.name, designation: data.designation },
    });
    return ok({ ok: true });
  });
}
