import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { dbError, getNumberPrefix, requireAppoAccess } from "@/lib/appo";
import { PREFIX_RE, tidyPrefix } from "@/lib/appo-link";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/admin/appo/settings — the prefix every new attestation number starts with. */
export async function GET() {
  return run(async () => {
    const user = await requireUser();
    requireAppoAccess(user);
    return ok({ number_prefix: await getNumberPrefix() });
  });
}

/**
 * PATCH /api/admin/appo/settings { number_prefix } — super admin only. Every number generated or typed
 * from now on starts with these three letters. Documents already saved keep their numbers (and with
 * them their links and QR codes); the page and the PDF still open for them.
 */
export async function PATCH(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const body = await readBody<{ number_prefix?: unknown }>(req);
    const prefix = tidyPrefix(String(body.number_prefix ?? ""));
    if (!PREFIX_RE.test(prefix)) throw new ApiError(400, "The prefix must be exactly three capital English letters, e.g. APN");

    const previous = await getNumberPrefix();
    // updated_at is left alone: it says when the sticker background was set.
    const { error } = await db().from("appo_settings").upsert({ id: true, number_prefix: prefix });
    if (error) {
      if (error.code === "42703" || error.code === "PGRST204") {
        throw new ApiError(500, "The database needs the latest Appo update. Run supabase/appo.sql in Supabase → SQL Editor again, then retry.");
      }
      throw dbError(error);
    }

    after(() =>
      logActivity({ user_id: user.id, action: "update_appo_number_prefix", details: { from: previous, to: prefix } }),
    );
    return ok({ number_prefix: prefix });
  });
}
