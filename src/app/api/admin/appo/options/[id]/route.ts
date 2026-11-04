import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, requirePermission, requireUser, run } from "@/lib/api";
import { dbError, OPTION_LABELS } from "@/lib/appo";
import { db } from "@/lib/supabase";
import type { AppoOption } from "@/lib/appo-types";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/admin/appo/options/:id — drops a value from its saved list. Documents that use it keep it. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appo_settings");
    const { id } = await params;

    const { data, error } = await db().from("appo_options").delete().eq("id", id).select("id,kind,value").maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new ApiError(404, "That value is no longer in the saved list");
    const option = data as AppoOption;

    await logActivity({
      user_id: user.id,
      action: "delete_appo_option",
      details: { kind: option.kind, label: OPTION_LABELS[option.kind], value: option.value },
    });
    return ok({ ok: true });
  });
}
